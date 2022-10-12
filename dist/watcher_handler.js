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
                // console.log("ok:", initialEvents, regularEvents, events);
                this.onTargetEvents(events);
            };
            const flushDebounced = utils_1.default.lang.debounce(() => {
                if (this.watcher.isClosed())
                    return;
                const initialsYedek = [...initials];
                const regularsYedek = new Set(regulars);
                initials = [];
                regulars = new Set();
                console.log("flush started");
                lock = flush(initialsYedek, regularsYedek);
                console.log("flush finished, initials set.");
            }, delay);
            return async (event, targetPath = '', isInitial = false) => {
                if (isInitial) { // Poll immediately
                    await this.eventsPopulate([targetPath], initials, true);
                }
                else { // Poll later
                    console.log("add regular");
                    regulars.add(targetPath);
                }
                console.log("acquire");
                lock.then(flushDebounced);
                console.log("acquire2");
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