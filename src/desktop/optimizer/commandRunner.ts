import { execFile } from 'node:child_process';
import path from 'node:path';

import { ScanFailure } from '../../domain/optimizer/scanner';

/**
 * The only way the optimizer runs anything: a fixed set of read-only Windows
 * PowerShell queries, chosen by id. No argument, path or text from the page
 * can reach these scripts. They use `Get-*` queries only, never run elevated,
 * and are started without a shell (execFile), with an absolute path to the
 * system's own powershell.exe.
 */

// Every script switches stdout to UTF-8 first, so names like "Höchstleistung" arrive intact.
const PRELUDE = "$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8;";

/** Network throughput of all adapters over 1,5 s, from raw performance counters (not localized). */
const NETWORK_SAMPLE = `
function Read-Network { $n=@{ rx=0.0; tx=0.0; ts=0.0; freq=1.0 }; foreach($i in Get-CimInstance -ClassName Win32_PerfRawData_Tcpip_NetworkInterface){ $n.rx+=[double]$i.BytesReceivedPersec; $n.tx+=[double]$i.BytesSentPersec; $n.ts=[double]$i.Timestamp_PerfTime; $n.freq=[double]$i.Frequency_PerfTime }; return $n }
$na=Read-Network
[Threading.Thread]::Sleep(1500)
$nb=Read-Network
$network=$null
$seconds=($nb.ts-$na.ts)/$nb.freq
if($seconds -gt 0){ $network=[pscustomobject]@{ receivedBytesPerSec=[math]::Max(0,[math]::Round(($nb.rx-$na.rx)/$seconds)); sentBytesPerSec=[math]::Max(0,[math]::Round(($nb.tx-$na.tx)/$seconds)) } }`;

export const READ_ONLY_SCRIPTS = Object.freeze({
  /**
   * Deep scan: per process CPU, GPU (busiest engine, as in Task Manager), RAM,
   * I/O rate (disk + network; Windows has no per-process network counter
   * without admin rights) and open TCP connections, over a 1,5 s sample.
   */
  'processes-deep': `${PRELUDE}
$cores=[Environment]::ProcessorCount
function Read-Sample {
  $cpu=@{}; foreach($p in Get-Process){ $cpu[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds }
  $gpu=@{}; $gts=0
  foreach($e in Get-CimInstance -ClassName Win32_PerfRawData_GPUPerformanceCounters_GPUEngine){ if($e.Name -match '^pid_(\\d+)_.*engtype_(.+)$'){ $k=$Matches[1]+'|'+$Matches[2]; $gpu[$k]=[double]$gpu[$k]+[double]$e.UtilizationPercentage; $gts=[double]$e.Timestamp_Sys100NS } }
  $io=@{}; $its=0; $ifreq=1
  foreach($p in Get-CimInstance -ClassName Win32_PerfRawData_PerfProc_Process){ if($p.IDProcess -gt 0){ $io[[int]$p.IDProcess]=[double]$p.IODataBytesPersec }; $its=[double]$p.Timestamp_PerfTime; $ifreq=[double]$p.Frequency_PerfTime }
  return @{ cpu=$cpu; gpu=$gpu; gts=$gts; io=$io; its=$its; ifreq=$ifreq }
}
$a=Read-Sample
$watch=[Diagnostics.Stopwatch]::StartNew()
[Threading.Thread]::Sleep(1500)
$b=Read-Sample
$elapsed=$watch.Elapsed.TotalMilliseconds
$gpuByPid=@{}
$gdt=$b.gts-$a.gts
if($gdt -gt 0){ foreach($k in $b.gpu.Keys){ if($a.gpu.ContainsKey($k)){ $pct=($b.gpu[$k]-$a.gpu[$k])/$gdt*100; $procId=[int]($k.Split('|')[0]); if($pct -gt [double]$gpuByPid[$procId]){ $gpuByPid[$procId]=$pct } } } }
$ioSeconds=($b.its-$a.its)/$b.ifreq
$conns=@{}; foreach($g in (Get-NetTCPConnection -State Established | Group-Object -Property OwningProcess)){ $conns[[int]$g.Name]=$g.Count }
$rows=foreach($p in Get-Process){ if($p.Id -eq $PID){ continue }  # not the measuring script itself
  $cpu=$null; $before=$a.cpu[$p.Id]; $now=$p.TotalProcessorTime.TotalMilliseconds
  if($before -ne $null -and $now -ne $null -and $elapsed -gt 0){ $cpu=[math]::Round((($now-$before)/$elapsed/$cores)*100,1) }
  $gpu=$null; if($gdt -gt 0){ $gpu=[math]::Round([math]::Min(100,[double]$gpuByPid[$p.Id]),1) }
  $io=$null; if($ioSeconds -gt 0 -and $a.io.ContainsKey($p.Id) -and $b.io.ContainsKey($p.Id)){ $io=[math]::Max(0,[math]::Round(($b.io[$p.Id]-$a.io[$p.Id])/$ioSeconds)) }
  [pscustomobject]@{ name=$p.ProcessName; pid=$p.Id; memoryBytes=[int64]$p.WorkingSet64; cpuPercent=$cpu; gpuPercent=$gpu; ioBytesPerSec=$io; connections=[int]$conns[$p.Id]; responding=$p.Responding; sessionId=$p.SessionId }
}
ConvertTo-Json -InputObject @($rows) -Compress -Depth 2`,

  /** Deep scan: the system query plus the network throughput. */
  'system-deep': `${PRELUDE}
$drives=foreach($d in Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3'){ [pscustomobject]@{ id=$d.DeviceID; label=[string]$d.VolumeName; fileSystem=[string]$d.FileSystem; totalBytes=[int64]$d.Size; freeBytes=[int64]$d.FreeSpace } }
$os=Get-CimInstance -ClassName Win32_OperatingSystem
$power=$null
$scheme=(powercfg.exe /getactivescheme) -join ' '
if($scheme -match '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})\\s+\\((.+)\\)'){ $power=[pscustomobject]@{ instanceId=('{'+$Matches[1]+'}'); name=$Matches[2].Trim() } }
${NETWORK_SAMPLE}
ConvertTo-Json -InputObject ([pscustomobject]@{ drives=@($drives); powerPlan=$power; caption=[string]$os.Caption; build=[string]$os.BuildNumber; network=$network }) -Compress -Depth 4`,

  /** Two samples of all processes 500 ms apart, for a CPU load per process. Protected processes report null. */
  processes: `${PRELUDE}
$cores=[Environment]::ProcessorCount
$first=@{}
foreach($p in Get-Process){ $first[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds }
$watch=[Diagnostics.Stopwatch]::StartNew()
[Threading.Thread]::Sleep(500)
$elapsed=$watch.Elapsed.TotalMilliseconds
$rows=foreach($p in Get-Process){
  $cpu=$null
  $before=$first[$p.Id]
  $now=$p.TotalProcessorTime.TotalMilliseconds
  if($before -ne $null -and $now -ne $null -and $elapsed -gt 0){ $cpu=[math]::Round((($now-$before)/$elapsed/$cores)*100,1) }
  [pscustomobject]@{ name=$p.ProcessName; pid=$p.Id; memoryBytes=[int64]$p.WorkingSet64; cpuPercent=$cpu; responding=$p.Responding; sessionId=$p.SessionId }
}
ConvertTo-Json -InputObject @($rows) -Compress -Depth 2`,

  /** Autostart values from the Run keys plus their enabled/disabled state from StartupApproved. Reads only. */
  startup: `${PRELUDE}
$base='Software\\Microsoft\\Windows\\CurrentVersion'
$sources=@(
  @{ id='hkcu-run'; key="HKCU:\\$base\\Run"; approved="HKCU:\\$base\\Explorer\\StartupApproved\\Run" },
  @{ id='hklm-run'; key="HKLM:\\$base\\Run"; approved="HKLM:\\$base\\Explorer\\StartupApproved\\Run" },
  @{ id='hklm-run-wow64'; key="HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"; approved="HKLM:\\$base\\Explorer\\StartupApproved\\Run32" }
)
function Get-ApprovedState($item, $name){ if(-not $item){ return $null }; $bytes=$item.GetValue($name); if($bytes -is [byte[]] -and $bytes.Length -gt 0){ return [int]$bytes[0] }; return $null }
$entries=foreach($s in $sources){
  $key=Get-Item -LiteralPath $s.key
  if(-not $key){ continue }
  $approved=Get-Item -LiteralPath $s.approved
  foreach($name in $key.GetValueNames()){
    if([string]::IsNullOrEmpty($name)){ continue }
    [pscustomobject]@{ source=$s.id; name=$name; command=[string]$key.GetValue($name, '', 'DoNotExpandEnvironmentNames'); approvedState=(Get-ApprovedState $approved $name) }
  }
}
$folders=foreach($scope in @(@{ id='user'; key="HKCU:\\$base\\Explorer\\StartupApproved\\StartupFolder" }, @{ id='common'; key="HKLM:\\$base\\Explorer\\StartupApproved\\StartupFolder" })){
  $item=Get-Item -LiteralPath $scope.key
  if(-not $item){ continue }
  foreach($name in $item.GetValueNames()){ [pscustomobject]@{ scope=$scope.id; name=$name; approvedState=(Get-ApprovedState $item $name) } }
}
ConvertTo-Json -InputObject ([pscustomobject]@{ entries=@($entries); folderApproved=@($folders) }) -Compress -Depth 4`,

  /** Local drives, the active power plan and the Windows edition. */
  system: `${PRELUDE}
$drives=foreach($d in Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3'){ [pscustomobject]@{ id=$d.DeviceID; label=[string]$d.VolumeName; fileSystem=[string]$d.FileSystem; totalBytes=[int64]$d.Size; freeBytes=[int64]$d.FreeSpace } }
$os=Get-CimInstance -ClassName Win32_OperatingSystem
$power=$null
$scheme=(powercfg.exe /getactivescheme) -join ' '
if($scheme -match '([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})\\s+\\((.+)\\)'){ $power=[pscustomobject]@{ instanceId=('{'+$Matches[1]+'}'); name=$Matches[2].Trim() } }
ConvertTo-Json -InputObject ([pscustomobject]@{ drives=@($drives); powerPlan=$power; caption=[string]$os.Caption; build=[string]$os.BuildNumber }) -Compress -Depth 4`,
});

export type ReadOnlyCommandId = keyof typeof READ_ONLY_SCRIPTS;

export const READ_ONLY_COMMAND_IDS = Object.freeze(Object.keys(READ_ONLY_SCRIPTS) as ReadOnlyCommandId[]);

export type CommandRunner = (id: ReadOnlyCommandId) => Promise<string>;

export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number; encoding: 'utf8'; shell: false; env: NodeJS.ProcessEnv },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export function powerShellPath(env: NodeJS.ProcessEnv): string {
  const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows';
  return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** The exact arguments for one query. Exported for the safety tests. */
export function buildPowerShellArgs(id: ReadOnlyCommandId): string[] {
  if (!Object.hasOwn(READ_ONLY_SCRIPTS, id)) throw new ScanFailure('command-failed', 'Unknown query.');
  const encoded = Buffer.from(READ_ONLY_SCRIPTS[id], 'utf16le').toString('base64');
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
}

export interface PowerShellRunnerOptions {
  env?: NodeJS.ProcessEnv;
  execFileImpl?: ExecFileLike;
  timeoutMs?: number;
}

export function createPowerShellRunner(options: PowerShellRunnerOptions = {}): CommandRunner {
  const env = options.env ?? process.env;
  const run = options.execFileImpl ?? (execFile as unknown as ExecFileLike);
  const timeout = options.timeoutMs ?? 20_000;
  return (id) =>
    new Promise((resolve, reject) => {
      let args: string[];
      try {
        args = buildPowerShellArgs(id);
      } catch (error) {
        reject(error);
        return;
      }
      // Deep queries sample for longer and load the network module on first use.
      const limit = id.endsWith('-deep') ? Math.max(timeout, 60_000) : timeout;
      run(powerShellPath(env), args, { timeout: limit, windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', shell: false, env }, (error, stdout) => {
        if (error) {
          const timedOut = (error as { killed?: boolean; signal?: string }).killed === true || (error as { signal?: string }).signal === 'SIGTERM';
          reject(new ScanFailure(timedOut ? 'timeout' : 'command-failed', timedOut ? 'The Windows query took too long.' : 'The Windows query failed.'));
          return;
        }
        resolve(stdout);
      });
    });
}

/** Parses the JSON a query printed; PowerShell sometimes adds a BOM or blank lines. */
export function parseCommandJson(stdout: string): unknown {
  const text = stdout.replace(/^\uFEFF/, '').trim();
  if (text === '') throw new ScanFailure('invalid-output', 'The Windows query returned nothing.');
  try {
    return JSON.parse(text);
  } catch {
    throw new ScanFailure('invalid-output', 'The answer of the Windows query could not be read.');
  }
}
