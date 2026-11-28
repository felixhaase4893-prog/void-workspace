import type { Catalog } from '../define';

/** App shell, shared UI pieces, navigation and formatting. */
export default {
  // Loading and recovery
  'Loading…': ['Cargando…', '加载中…', 'Wird geladen…'],
  'Loading your workspace…': ['Cargando tu espacio de trabajo…', '正在加载你的工作区…', 'Dein Arbeitsbereich wird geladen…'],
  'Page not found': ['Página no encontrada', '页面未找到', 'Seite nicht gefunden'],
  'Lost in the void': ['Perdido en el vacío', '迷失在虚空中', 'Verloren im Nichts'],
  'This page does not exist. It may have moved, or the link is wrong.': ['Esta página no existe. Puede que se haya movido o que el enlace sea incorrecto.', '此页面不存在。它可能已被移动，或者链接有误。', 'Diese Seite gibt es nicht. Vielleicht wurde sie verschoben oder der Link ist falsch.'],
  'Back to dashboard': ['Volver al panel', '返回仪表盘', 'Zurück zum Dashboard'],
  'VOID could not open your saved data': ['VOID no pudo abrir tus datos guardados', 'VOID 无法打开你保存的数据', 'VOID konnte deine gespeicherten Daten nicht öffnen'],
  'Technical details': ['Detalles técnicos', '技术详情', 'Technische Details'],
  'Nothing has been deleted. Download the raw data to keep a copy, then start fresh. The unreadable data also stays in browser storage as a backup.': ['No se ha borrado nada. Descarga los datos sin procesar para guardar una copia y luego empieza de cero. Los datos ilegibles también se quedan en el almacenamiento del navegador como copia de seguridad.', '没有删除任何内容。请先下载原始数据保留一份副本，然后重新开始。无法读取的数据也会作为备份保留在浏览器存储中。', 'Es wurde nichts gelöscht. Lade die Rohdaten herunter, um eine Kopie zu behalten, und starte dann neu. Die unlesbaren Daten bleiben außerdem als Sicherung im Browserspeicher.'],
  'Start fresh': ['Empezar de cero', '重新开始', 'Neu beginnen'],
  'Download raw data': ['Descargar datos sin procesar', '下载原始数据', 'Rohdaten herunterladen'],
  'Try again': ['Reintentar', '重试', 'Erneut versuchen'],

  // Navigation
  Dashboard: ['Panel', '仪表盘', 'Dashboard'],
  Projects: ['Proyectos', '项目', 'Projekte'],
  Tasks: ['Tareas', '任务', 'Aufgaben'],
  Bugs: ['Bugs', '缺陷', 'Bugs'],
  Notes: ['Notas', '笔记', 'Notizen'],
  'Snippet Vault': ['Bóveda de snippets', '代码片段库', 'Snippet-Tresor'],
  'Code Tester': ['Probador de código', '代码测试器', 'Code-Tester'],
  Statistics: ['Estadísticas', '统计', 'Statistik'],
  'PC Optimizer': ['Optimizador de PC', '电脑优化', 'PC-Optimierer'],
  Settings: ['Ajustes', '设置', 'Einstellungen'],
  'Search everything': ['Buscar en todo', '搜索全部内容', 'Alles durchsuchen'],
  'Quick add: create a task, project, note, snippet or bug': ['Añadido rápido: crea una tarea, un proyecto, una nota, un snippet o un bug', '快速添加：创建任务、项目、笔记、代码片段或缺陷', 'Schnell hinzufügen: Aufgabe, Projekt, Notiz, Snippet oder Bug erstellen'],
  'Go to {label}': ['Ir a {label}', '前往{label}', 'Zu {label} wechseln'],
  'Close a dialog, or leave selection mode in a list': ['Cerrar un diálogo o salir del modo de selección en una lista', '关闭对话框，或退出列表中的选择模式', 'Dialog schließen oder Auswahlmodus in einer Liste verlassen'],
  'Developer tools': ['Herramientas de desarrollo', '开发者工具', 'Entwicklerwerkzeuge'],
  '{label} (Ctrl {shortcut})': ['{label} (Ctrl {shortcut})', '{label}（Ctrl {shortcut}）', '{label} (Strg {shortcut})'],
  'Skip to content': ['Saltar al contenido', '跳到内容', 'Zum Inhalt springen'],
  'Saved on this device': ['Guardado en este dispositivo', '已保存在此设备上', 'Auf diesem Gerät gespeichert'],
  'Not saved: storage unavailable': ['No guardado: almacenamiento no disponible', '未保存：存储不可用', 'Nicht gespeichert: Speicher nicht verfügbar'],
  'VOID dashboard': ['Panel de VOID', 'VOID 仪表盘', 'VOID-Dashboard'],
  'Open navigation': ['Abrir navegación', '打开导航', 'Navigation öffnen'],
  Navigation: ['Navegación', '导航', 'Navigation'],
  Main: ['Principal', '主导航', 'Hauptnavigation'],
  Workspace: ['Espacio de trabajo', '工作区', 'Arbeitsbereich'],

  // Banners and shared UI
  'Your data is only kept until you close this tab': ['Tus datos solo se conservan hasta que cierres esta pestaña', '你的数据只会保留到关闭此标签页为止', 'Deine Daten bleiben nur erhalten, bis du diesen Tab schließt'],
  'VOID is using temporary memory instead. Allow site data for this page to keep your work.': ['VOID está usando memoria temporal en su lugar. Permite los datos del sitio para esta página para conservar tu trabajo.', 'VOID 正在改用临时内存。请允许此页面存储网站数据以保留你的工作。', 'VOID nutzt stattdessen temporären Speicher. Erlaube Websitedaten für diese Seite, damit deine Arbeit erhalten bleibt.'],
  'Your last change could not be saved': ['Tu último cambio no se pudo guardar', '你最近的更改无法保存', 'Deine letzte Änderung konnte nicht gespeichert werden'],
  'The change is visible now but will be lost on reload.': ['El cambio se ve ahora, pero se perderá al recargar.', '此更改现在可见，但重新加载后会丢失。', 'Die Änderung ist jetzt sichtbar, geht aber beim Neuladen verloren.'],
  Dismiss: ['Descartar', '关闭', 'Schließen'],
  Cancel: ['Cancelar', '取消', 'Abbrechen'],
  Close: ['Cerrar', '关闭', 'Schließen'],
  'Tip:': ['Consejo:', '提示：', 'Tipp:'],
  'adds anything from any page.': ['añade lo que quieras desde cualquier página.', '可在任意页面添加任何内容。', 'fügt auf jeder Seite alles hinzu.'],
  Optional: ['Opcional', '可选', 'Optional'],
  'Not implemented yet': ['Aún no implementado', '尚未实现', 'Noch nicht umgesetzt'],
  Planned: ['Planificado', '计划中', 'Geplant'],

  // Relative time and greetings
  'just now': ['justo ahora', '刚刚', 'gerade eben'],
  'Working late': ['Trabajando hasta tarde', '还在熬夜工作', 'Noch spät am Arbeiten'],
  'Good morning': ['Buenos días', '早上好', 'Guten Morgen'],
  'Good afternoon': ['Buenas tardes', '下午好', 'Guten Tag'],
  'Good evening': ['Buenas noches', '晚上好', 'Guten Abend'],

  // Language setting
  Language: ['Idioma', '语言', 'Sprache'],
  'The language VOID uses for menus, labels and messages. Your own content is not translated.': ['El idioma que VOID usa en menús, etiquetas y mensajes. Tu propio contenido no se traduce.', 'VOID 在菜单、标签和消息中使用的语言。你自己的内容不会被翻译。', 'Die Sprache, die VOID für Menüs, Beschriftungen und Meldungen verwendet. Deine eigenen Inhalte werden nicht übersetzt.'],
  'App language': ['Idioma de la app', '应用语言', 'App-Sprache'],

  // Storage errors (shown in the recovery screen and banners)
  'The browser storage quota is full. Export your data and free up space.': ['El almacenamiento del navegador está lleno. Exporta tus datos y libera espacio.', '浏览器存储空间已满。请导出你的数据并释放空间。', 'Der Browserspeicher ist voll. Exportiere deine Daten und schaffe Platz.'],
  'Saving failed: {reason}': ['No se pudo guardar: {reason}', '保存失败：{reason}', 'Speichern fehlgeschlagen: {reason}'],
  'Browser storage could not be read: {reason}': ['No se pudo leer el almacenamiento del navegador: {reason}', '无法读取浏览器存储：{reason}', 'Der Browserspeicher konnte nicht gelesen werden: {reason}'],
  'Browser storage is not available ({reason}).': ['El almacenamiento del navegador no está disponible ({reason}).', '浏览器存储不可用（{reason}）。', 'Der Browserspeicher ist nicht verfügbar ({reason}).'],
  'This device (local storage)': ['Este dispositivo (almacenamiento local)', '此设备（本地存储）', 'Dieses Gerät (lokaler Speicher)'],
  'Temporary memory (lost on reload)': ['Memoria temporal (se pierde al recargar)', '临时内存（重新加载后丢失）', 'Temporärer Speicher (geht beim Neuladen verloren)'],
  'Stored data is not valid JSON.': ['Los datos guardados no son JSON válido.', '存储的数据不是有效的 JSON。', 'Die gespeicherten Daten sind kein gültiges JSON.'],
  'Stored data does not match the expected format.': ['Los datos guardados no tienen el formato esperado.', '存储的数据与预期格式不符。', 'Die gespeicherten Daten haben nicht das erwartete Format.'],
  'Refusing to save data that does not match the expected format.': ['No se guardan datos que no tienen el formato esperado.', '拒绝保存与预期格式不符的数据。', 'Daten, die nicht dem erwarteten Format entsprechen, werden nicht gespeichert.'],
  'Stored data is not an object.': ['Los datos guardados no son un objeto.', '存储的数据不是一个对象。', 'Die gespeicherten Daten sind kein Objekt.'],
  'Stored data has no valid schema version.': ['Los datos guardados no tienen una versión de esquema válida.', '存储的数据没有有效的结构版本。', 'Die gespeicherten Daten haben keine gültige Schema-Version.'],
  'Stored data uses format version {version}, but this version of VOID only understands up to {target}. Please update VOID.': ['Los datos guardados usan la versión de formato {version}, pero esta versión de VOID solo entiende hasta la {target}. Actualiza VOID.', '存储的数据使用格式版本 {version}，但此版本的 VOID 最多只支持 {target}。请更新 VOID。', 'Die gespeicherten Daten nutzen Formatversion {version}, diese VOID-Version versteht aber nur bis {target}. Bitte aktualisiere VOID.'],
} as const satisfies Catalog;
