/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import debounce from 'debounce';
import { Callback, Ignore, ReaddirMap, Stats } from './types';
declare const Utils: {
    lang: {
        areShallowEqual: ((x: any, y: any) => boolean) & {
            default: (x: any, y: any) => boolean;
        };
        debounce: typeof debounce;
        attempt: <T>(fn: () => T) => T | Error;
        castArray: <T_1>(x: T_1 | T_1[]) => T_1[];
        castError(exception: unknown): Error;
        defer: (callback: Callback) => NodeJS.Timeout;
        isArray: (x: any) => x is any[];
        isError(x: any): x is Error;
        isFunction: (x: any) => x is Function;
        isNumber: (x: any) => x is number;
        isString: (x: any) => x is string;
        isUndefined: (x: any) => x is undefined;
        noop: () => undefined;
        uniq: <T_2>(arr: T_2[]) => T_2[];
    };
    fs: {
        isSubPath: (targetPath: string, subPath: string) => boolean;
        poll: (targetPath: string, timeout?: number) => Promise<Stats | undefined>;
        readdir: (rootPath: string, ignore?: Ignore, depth?: number, signal?: {
            aborted: boolean;
        }, readdirMap?: ReaddirMap) => Promise<[string[], string[]]>;
    };
};
export default Utils;
