import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OptimizerService } from '../../domain/optimizer/service';
import { createSimulatedScannerSuite, SIMULATED_CONTEXT } from '../../domain/optimizer/simulated';
import OptimizerPage from './OptimizerPage';
import { wrapBridge, type OptimizerClient } from './optimizerClient';

function demoClient(openTarget: OptimizerClient['openTarget'] = null): OptimizerClient {
  return { mode: 'demo', api: new OptimizerService({ scanners: createSimulatedScannerSuite(), context: SIMULATED_CONTEXT }), openTarget };
}

async function scanned(mode: 'Quick scan' | 'Deep scan' = 'Quick scan', openTarget: OptimizerClient['openTarget'] = null) {
  const user = userEvent.setup();
  const client = demoClient(openTarget);
  const spies = {
    updateSelection: vi.spyOn(client.api, 'updateSelection'),
    executeDryRun: vi.spyOn(client.api, 'executeDryRun'),
  };
  render(<OptimizerPage client={client} />);
  await user.click(screen.getAllByRole('button', { name: mode })[0]!);
  await screen.findByRole('heading', { name: 'Optimization preview' });
  return { user, client, spies };
}

function tile(label: string) {
  return screen.getByText(label).parentElement!;
}

describe('PC Optimizer page', () => {
  it('shows the preview with safe defaults, overlaps counted once and blocked items locked', async () => {
    await scanned();
    expect(screen.getByText(/12 recommendations found/)).toBeInTheDocument();
    expect(screen.getByText('Read-only · simulation mode')).toBeInTheDocument();
    expect(within(tile('Selected actions')).getByText('2')).toBeInTheDocument();
    // 1,6 GB + 880 MB, minus the 420 MB dump both contain.
    expect(within(tile('Potentially freed')).getByText('2.1 GB')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Clean up temporary files' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Review startup: Discord' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Review startup: SecurityHealth' })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Not selectable')).toHaveLength(3);
  });

  it('updates the totals instantly and supports select-all-safe and reset', async () => {
    const { user, spies } = await scanned();
    await user.click(screen.getByRole('checkbox', { name: 'Clean up temporary files' }));
    expect(within(tile('Selected actions')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Potentially freed')).getByText('880 MB')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'End chrome' }));
    expect(within(tile('Affected items')).getByText(/3 processes/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select all safe' }));
    await waitFor(() => expect(within(tile('Selected actions')).getByText('3')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reset selection' }));
    await waitFor(() => expect(within(tile('Selected actions')).getByText('2')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'End chrome' })).not.toBeChecked();
    // Only recommendation ids are ever sent to the backend.
    for (const [, ids] of spies.updateSelection.mock.calls) for (const id of ids as string[]) expect(id).toMatch(/^(cleanup|startup|process|power)\./);
  });

  it('explains every recommendation in the detail view', async () => {
    const { user } = await scanned();
    const item = screen.getByRole('checkbox', { name: 'Remove crash dumps' }).closest('li')!;
    await user.click(within(item).getByRole('button', { name: 'Details' }));
    for (const question of ['What was found?', 'Why is this recommended?', 'What would change?', 'What are the risks?', 'Can the change be undone?']) {
      expect(within(item).getByText(question)).toBeInTheDocument();
    }
    expect(within(item).getByText(/Overlaps with/)).toBeInTheDocument();
  });

  it('validates, asks for explicit confirmation and then only simulates', async () => {
    const { user, spies } = await scanned();
    await user.click(screen.getByRole('button', { name: 'Validate preview' }));
    expect(await screen.findByText('Preview is valid')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm optimization' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm optimization' });
    expect(within(dialog).getByText('Clean up temporary files')).toBeInTheDocument();
    expect(within(dialog).getByText(/values are estimates/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Confirm and simulate' });
    expect(confirm).toBeDisabled();
    expect(spies.executeDryRun).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(confirm);
    expect(await screen.findByText('Simulation complete – no system changes were made.')).toBeInTheDocument();
    expect(spies.executeDryRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/System changes: 0/)).toBeInTheDocument();
    expect(await screen.findByText('Recent simulations')).toBeInTheDocument();
  });

  it('deep scan shows performance hogs with fix steps and what pulls the most CPU, GPU, RAM and network', async () => {
    const { user } = await scanned('Deep scan');
    expect(screen.getByRole('heading', { name: /Performance hogs/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What uses the most performance?' })).toBeInTheDocument();
    for (const title of ['Overall ranking', 'CPU', 'GPU', 'RAM', 'Network']) expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    // GameClient (71 % GPU, 38 % CPU, 2.2 GB) tops the overall ranking.
    const ranking = screen.getByRole('heading', { name: 'Overall ranking' }).closest('section')!.querySelector('ol')!;
    expect(within(ranking).getAllByRole('listitem')[0]).toHaveTextContent('GameClient');
    expect(screen.getByText(/I\/O rate \(disk \+ network\)/)).toBeInTheDocument();
    expect(screen.getAllByText('How to fix it:').length).toBeGreaterThan(0);
    // Deep-only cleanup shows up as a recommendation.
    expect(screen.getByRole('checkbox', { name: /error reports/ })).toBeInTheDocument();
    // "Go to action" scrolls to the linked recommendation.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await user.click(screen.getAllByRole('button', { name: 'Go to action' })[0]!);
    expect(scroll).toHaveBeenCalled();
  });

  it('quick scan has no deep sections; open buttons are disabled in the demo', async () => {
    await scanned();
    expect(screen.queryByRole('heading', { name: /Performance hogs/ })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Open Temp folder' })) expect(button).toBeDisabled();
  });

  it('one-click open sends only the fixed target id', async () => {
    const open = vi.fn(async () => true);
    const { user } = await scanned('Quick scan', open);
    await user.click(screen.getAllByRole('button', { name: 'Open Task Manager' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Open drive C:' }));
    expect(open.mock.calls).toEqual([['app:task-manager'], ['drive:C:']]);
  });

  it('cancel discards the preview', async () => {
    const { user } = await scanned();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/recommendations found/)).not.toBeInTheDocument();
  });
});

describe('desktop bridge wrapper', () => {
  it('rejects answers that do not match the schema', async () => {
    const fake = demoClient().api;
    const tampered = wrapBridge({ ...fake, startScan: async () => ({ ok: true, value: { scanId: 'x', evil: true } as never }) });
    const response = await tampered.startScan();
    expect(response).toMatchObject({ ok: false, error: { code: 'internal' } });
  });
});
