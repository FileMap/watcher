/// <reference types="node" />
/// <reference types="node" />
import Aborter from 'aborter';
import { EventEmitter } from 'events';
import { TargetEvent } from './enums';
import WatcherHandler from './watcher_handler';
import WatcherLocker from './watcher_locker';
import WatcherPoller from './watcher_poller';
import { Callback, Disposer, Handler, Ignore, Path, PollerConfig, SubwatcherConfig, WatcherOptions, WatcherConfig } from './types';
declare class Watcher extends EventEmitter {
    _closed: boolean;
    _ready: boolean;
    _closeAborter: Aborter.type;
    _closeSignal: {
        aborted: boolean;
    };
    _closeWait: Promise<void>;
    _readyWait: Promise<void>;
    _locker: WatcherLocker;
    _roots: Set<Path>;
    _poller: WatcherPoller;
    _pollers: Set<PollerConfig>;
    _subwatchers: Set<SubwatcherConfig>;
    _watchers: Record<Path, WatcherConfig[]>;
    _watchersLock: Promise<void>;
    _watchersRestorable: Record<Path, WatcherConfig>;
    _watchersRestoreTimeout?: NodeJS.Timeout;
    constructor(target?: Path[] | Path | Handler, options?: WatcherOptions | Handler, handler?: Handler);
    isClosed(): boolean;
    isIgnored(targetPath: Path, ignore?: Ignore): boolean;
    isReady(): boolean;
    close(): boolean;
    error(exception: unknown): boolean;
    event(event: TargetEvent, targetPath: Path, targetPathNext?: Path): boolean;
    ready(): boolean;
    pollerExists(targetPath: Path, options: WatcherOptions): boolean;
    subwatcherExists(targetPath: Path, options: WatcherOptions): boolean;
    watchersClose(folderPath?: Path, filePath?: Path, recursive?: boolean): void;
    watchersLock(callback: Callback): Promise<void>;
    watchersRestore(): void;
    watcherAdd(config: WatcherConfig, baseWatcherHandler?: WatcherHandler): Promise<WatcherHandler>;
    watcherClose(config: WatcherConfig): void;
    watcherExists(folderPath: Path, options: WatcherOptions, handler: Handler, filePath?: Path): boolean;
    watchDirectories(foldersPaths: Path[], options: WatcherOptions, handler: Handler, filePath?: Path, baseWatcherHandler?: WatcherHandler): Promise<WatcherHandler | undefined>;
    watchDirectory(folderPath: Path, options: WatcherOptions, handler: Handler, filePath?: Path, baseWatcherHandler?: WatcherHandler): Promise<void>;
    watchFileOnce(filePath: Path, options: WatcherOptions, callback: Callback): Promise<void>;
    watchFile(filePath: Path, options: WatcherOptions, handler: Handler): Promise<void>;
    watchPollingOnce(targetPath: Path, options: WatcherOptions, callback: Callback): Promise<void>;
    watchPolling(targetPath: Path, options: WatcherOptions, callback: Callback): Promise<Disposer>;
    watchUnknownChild(targetPath: Path, options: WatcherOptions, handler: Handler): Promise<void>;
    watchUnknownTarget(targetPath: Path, options: WatcherOptions, handler: Handler): Promise<void>;
    watchPaths(targetPaths: Path[], options: WatcherOptions, handler: Handler): Promise<void>;
    watchPath(targetPath: Path, options: WatcherOptions, handler: Handler): Promise<void>;
    watch(target?: Path[] | Path | Handler, options?: WatcherOptions | Handler, handler?: Handler): Promise<void>;
}
declare const _default: typeof Watcher & {
    default: typeof Watcher;
}
declare namespace _default {
    export type type = Watcher;
}
export = _default;
