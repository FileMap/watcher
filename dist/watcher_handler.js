"use strict";
/* IMPORT */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const constants_1 = require("./constants");
const utils_1 = __importDefault(require("./utils"));
/* WATCHER HANDLER */
class WatcherHandler {
    /* CONSTRUCTOR */
    constructor(watcher, config, base) {
        this.base = base;
        this.watcher = watcher;
        this.handler = config.handler;
        this.fswatcher = config.watcher;
        this.options = config.options;
        this.folderPath = config.folderPath;
        this.filePath = config.filePath;
        this['handlerBatched'] = this.base ? this.base.onWatcherEvent.bind(this.base) : this._makeHandlerBatched(this.options.debounce); //UGLY
    }
    /* HELPERS */
    _isSubRoot(targetPath) {
        if (this.filePath) {
            return targetPath === this.filePath;
        }
        else {
            return targetPath === this.folderPath || utils_1.default.fs.isSubPath(this.folderPath, targetPath);
        }
    }
    _makeHandlerBatched(delay = constants_1.DEBOUNCE) {
        return (() => {
            let lock = this.watcher._readyWait, // ~Ensuring no two flushes are active in parallel, or before the watcher is ready
            initials = [], regulars = new Set();
            const flush = async (initials, regulars) => {
                const initialEvents = this.options.ignoreInitial ? [] : initials, regularEvents = await this.eventsPopulate([...regulars]), events = this.eventsDeduplicate([...initialEvents, ...regularEvents]);
                console.log("ok:", initialEvents.length, regularEvents.length, events.length);
                console.log("ok:", initialEvents, regularEvents, events);
                this.onTargetEvents(events);
            };
            const flushDebounced = utils_1.default.lang.debounce(() => {
                if (this.watcher.isClosed())
                    return;
                lock = flush(initials, regulars);
                initials = [];
                regulars = new Set();
            }, delay);
            return async (event, targetPath = '', isInitial = false) => {
                if (isInitial) { // Poll immediately
                    await this.eventsPopulate([targetPath], initials, true);
                }
                else { // Poll later
                    regulars.add(targetPath);
                }
                lock.then(flushDebounced);
            };
        })();
    }
    /* EVENT HELPERS */
    eventsDeduplicate(events) {
        if (events.length < 2)
            return events;
        const targetsEventPrev = {};
        return events.reduce((acc, event) => {
            const [targetEvent, targetPath] = event, targetEventPrev = targetsEventPrev[targetPath];
            if (targetEvent === targetEventPrev)
                return acc; // Same event, ignoring
            if (targetEvent === "change" /* TargetEvent.CHANGE */ && targetEventPrev === "add" /* TargetEvent.ADD */)
                return acc; // "change" after "add", ignoring
            targetsEventPrev[targetPath] = targetEvent;
            acc.push(event);
            return acc;
        }, []);
    }
    async eventsPopulate(targetPaths, events = [], isInitial = false) {
        await Promise.all(targetPaths.map(async (targetPath) => {
            const targetEvents = await this.watcher._poller.update(targetPath, this.options.pollingTimeout);
            await Promise.all(targetEvents.map(async (event) => {
                events.push([event, targetPath]);
                if (event === "addDir" /* TargetEvent.ADD_DIR */) {
                    await this.eventsPopulateAddDir(targetPaths, targetPath, events, isInitial);
                }
                else if (event === "unlinkDir" /* TargetEvent.UNLINK_DIR */) {
                    await this.eventsPopulateUnlinkDir(targetPaths, targetPath, events, isInitial);
                }
            }));
        }));
        return events;
    }
    ;
    async eventsPopulateAddDir(targetPaths, targetPath, events = [], isInitial = false) {
        var _a, _b;
        if (isInitial)
            return events;
        const depth = this.options.recursive ? (_a = this.options.depth) !== null && _a !== void 0 ? _a : constants_1.DEPTH : Math.min(1, (_b = this.options.depth) !== null && _b !== void 0 ? _b : constants_1.DEPTH), [directories, files] = await utils_1.default.fs.readdir(targetPath, this.options.ignore, depth, this.watcher._closeSignal), targetSubPaths = [...directories, ...files];
        await Promise.all(targetSubPaths.map(targetSubPath => {
            if (this.watcher.isIgnored(targetSubPath, this.options.ignore))
                return;
            if (targetPaths.includes(targetSubPath))
                return;
            return this.eventsPopulate([targetSubPath], events, true);
        }));
        return events;
    }
    async eventsPopulateUnlinkDir(targetPaths, targetPath, events = [], isInitial = false) {
        if (isInitial)
            return events;
        for (const folderPathOther of this.watcher._poller.stats.keys()) {
            if (!utils_1.default.fs.isSubPath(targetPath, folderPathOther))
                continue;
            if (targetPaths.includes(folderPathOther))
                continue;
            await this.eventsPopulate([folderPathOther], events, true);
        }
        return events;
    }
    /* EVENT HANDLERS */
    onTargetAdd(targetPath) {
        if (this._isSubRoot(targetPath)) {
            if (this.options.renameDetection) {
                this.watcher._locker.getLockTargetAdd(targetPath, this.options.renameTimeout);
            }
            else {
                this.watcher.event("add" /* TargetEvent.ADD */, targetPath);
            }
        }
    }
    onTargetAddDir(targetPath) {
        if (targetPath !== this.folderPath && this.options.recursive && (!constants_1.HAS_NATIVE_RECURSION && this.options.native !== false)) {
            this.watcher.watchDirectory(targetPath, this.options, this.handler, undefined, this.base || this);
        }
        if (this._isSubRoot(targetPath)) {
            if (this.options.renameDetection) {
                this.watcher._locker.getLockTargetAddDir(targetPath, this.options.renameTimeout);
            }
            else {
                this.watcher.event("addDir" /* TargetEvent.ADD_DIR */, targetPath);
            }
        }
    }
    onTargetChange(targetPath) {
        if (this._isSubRoot(targetPath)) {
            this.watcher.event("change" /* TargetEvent.CHANGE */, targetPath);
        }
    }
    onTargetUnlink(targetPath) {
        this.watcher.watchersClose(path_1.default.dirname(targetPath), targetPath, false);
        if (this._isSubRoot(targetPath)) {
            if (this.options.renameDetection) {
                this.watcher._locker.getLockTargetUnlink(targetPath, this.options.renameTimeout);
            }
            else {
                this.watcher.event("unlink" /* TargetEvent.UNLINK */, targetPath);
            }
        }
    }
    onTargetUnlinkDir(targetPath) {
        this.watcher.watchersClose(path_1.default.dirname(targetPath), targetPath, false);
        this.watcher.watchersClose(targetPath);
        if (this._isSubRoot(targetPath)) {
            if (this.options.renameDetection) {
                this.watcher._locker.getLockTargetUnlinkDir(targetPath, this.options.renameTimeout);
            }
            else {
                this.watcher.event("unlinkDir" /* TargetEvent.UNLINK_DIR */, targetPath);
            }
        }
    }
    onTargetEvent(event) {
        const [targetEvent, targetPath] = event;
        if (targetEvent === "add" /* TargetEvent.ADD */) {
            this.onTargetAdd(targetPath);
        }
        else if (targetEvent === "addDir" /* TargetEvent.ADD_DIR */) {
            this.onTargetAddDir(targetPath);
        }
        else if (targetEvent === "change" /* TargetEvent.CHANGE */) {
            this.onTargetChange(targetPath);
        }
        else if (targetEvent === "unlink" /* TargetEvent.UNLINK */) {
            this.onTargetUnlink(targetPath);
        }
        else if (targetEvent === "unlinkDir" /* TargetEvent.UNLINK_DIR */) {
            this.onTargetUnlinkDir(targetPath);
        }
    }
    onTargetEvents(events) {
        for (const event of events) {
            this.onTargetEvent(event);
        }
    }
    onWatcherEvent(event, targetPath, isInitial = false) {
        return this['handlerBatched'](event, targetPath, isInitial);
    }
    onWatcherChange(event = "change" /* FSTargetEvent.CHANGE */, targetName) {
        if (this.watcher.isClosed())
            return;
        const targetPath = path_1.default.resolve(this.folderPath, targetName || '');
        if (this.filePath && targetPath !== this.folderPath && targetPath !== this.filePath)
            return;
        if (this.watcher.isIgnored(targetPath, this.options.ignore))
            return;
        this.onWatcherEvent(event, targetPath);
    }
    onWatcherError(error) {
        if (constants_1.IS_WINDOWS && error.code === 'EPERM') { // This may happen when a folder is deleted
            this.onWatcherChange("change" /* FSTargetEvent.CHANGE */, '');
        }
        else {
            this.watcher.error(error);
        }
    }
    /* API */
    async init() {
        await this.initWatcherEvents();
        await this.initInitialEvents();
    }
    async initWatcherEvents() {
        const onChange = this.onWatcherChange.bind(this);
        this.fswatcher.on("change" /* FSWatcherEvent.CHANGE */, onChange);
        const onError = this.onWatcherError.bind(this);
        this.fswatcher.on("error" /* FSWatcherEvent.ERROR */, onError);
    }
    async initInitialEvents() {
        var _a, _b;
        const isInitial = !this.watcher.isReady(); // "isInitial" => is ignorable via the "ignoreInitial" option
        if (this.filePath) { // Single initial path
            if (this.watcher._poller.stats.has(this.filePath))
                return; // Already polled
            await this.onWatcherEvent("change" /* FSTargetEvent.CHANGE */, this.filePath, isInitial);
        }
        else { // Multiple initial paths
            const depth = this.options.recursive && (constants_1.HAS_NATIVE_RECURSION && this.options.native !== false) ? (_a = this.options.depth) !== null && _a !== void 0 ? _a : constants_1.DEPTH : Math.min(1, (_b = this.options.depth) !== null && _b !== void 0 ? _b : constants_1.DEPTH), [directories, files] = await utils_1.default.fs.readdir(this.folderPath, this.options.ignore, depth, this.watcher._closeSignal, this.options.readdirMap), targetPaths = [this.folderPath, ...directories, ...files];
            await Promise.all(targetPaths.map(targetPath => {
                if (this.watcher._poller.stats.has(targetPath))
                    return; // Already polled
                if (this.watcher.isIgnored(targetPath, this.options.ignore))
                    return;
                return this.onWatcherEvent("change" /* FSTargetEvent.CHANGE */, targetPath, isInitial);
            }));
        }
    }
}
/* EXPORT */
exports.default = WatcherHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlcl9oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3dhdGNoZXJfaGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsWUFBWTs7Ozs7QUFFWixnREFBd0I7QUFDeEIsMkNBQThFO0FBRTlFLG9EQUE0QjtBQUk1QixxQkFBcUI7QUFFckIsTUFBTSxjQUFjO0lBWWxCLGlCQUFpQjtJQUVqQixZQUFjLE9BQWdCLEVBQUUsTUFBcUIsRUFBRSxJQUFxQjtRQUUxRSxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDOUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUM5QixJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBRWhDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBRyxJQUFJLENBQUMsSUFBSSxDQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBRSxDQUFDLENBQUMsTUFBTTtJQUUvSSxDQUFDO0lBRUQsYUFBYTtJQUViLFVBQVUsQ0FBRyxVQUFnQjtRQUUzQixJQUFLLElBQUksQ0FBQyxRQUFRLEVBQUc7WUFFbkIsT0FBTyxVQUFVLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBQztTQUVyQzthQUFNO1lBRUwsT0FBTyxVQUFV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