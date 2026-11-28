import code from './code';
import optimizer from './optimizer';
import domain from './domain';
import pages from './pages';
import settings from './settings';
import shell from './shell';
import tools from './tools';

/** Every area's catalog; an English text must appear in only one of them (checked by a test). */
export const AREAS = { shell, domain, settings, pages, tools, code, optimizer } as const;

export const CATALOG = { ...shell, ...domain, ...settings, ...pages, ...tools, ...code, ...optimizer } as const;

/** Every English message VOID can translate. */
export type MessageKey = keyof typeof CATALOG;
