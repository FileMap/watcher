/// <reference types="node" />
/// <reference types="node" />
import { FSTargetEvent } from './enums';
import Watcher from './watcher';
import { Event, FSWatcher, Handler, Path, WatcherOptions, WatcherConfig } from './types';
declare class WatcherHandler {
    base?: WatcherHandler;
    watcher: Watcher;
    handler: Handler;
    fswatcher: FSWatcher;
    options: WatcherOptions;
    folderPath: Path;
    filePath?: Path;
    constructor(watcher: Watcher, config: WatcherConfig, base?: WatcherHandler);
    _isSubRoot(targetPath: Path): boolean;
    _makeHandlerBatched(delay?: number): (event: FSTargetEvent, targetPath?: Path, isInitial?: boolean) => Promise<void>;
    eventsDeduplicate(events: Event[]): Event[];
    eventsPopulate(targetPaths: Path[], events?: Event[], isInitial?: boolean): Promise<Event[]>;
    eventsPopulateAddDir(targetPaths: Path[], targetPath: Path, events?: Event[], isInitial?: boolean): Promise<Event[]>;
    eventsPopulateUnlinkDir(targetPaths: Path[], targetPath: Path, events?: Event[], isInitial?: boolean): Promise<Event[]>;
    onTargetAdd(targetPath: Path): void;
    onTargetAddDir(targetPath: Path): void;
    onTargetChange(targetPath: Path): void;
    onTargetUnlink(targetPath: Path): void;
    onTargetUnlinkDir(targetPath: Path): void;
    onTargetEvent(event: Event): void;
    onTargetEvents(events: Event[]): void;
    onWatcherEvent(event?: FSTargetEvent, targetPath?: Path, isInitial?: boolean): Promise<void>;
    onWatcherChange(event?: FSTargetEvent, targetName?: string | null): void;
    onWatcherError(error: NodeJS.ErrnoException): void;
    init(): Promise<void>;
    initWatcherEvents(): Promise<void>;
    initInitialEvents(): Promise<void>;
}
export default WatcherHandler;
