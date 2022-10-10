"use strict";
/* IMPORT */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const aborter_1 = __importDefault(require("aborter"));
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const string_indexes_1 = __importDefault(require("string-indexes"));
const constants_1 = require("./constants");
const watcher_handler_1 = __importDefault(require("./watcher_handler"));
const watcher_locker_1 = __importDefault(require("./watcher_locker"));
const watcher_poller_1 = __importDefault(require("./watcher_poller"));
const utils_1 = __importDefault(require("./utils"));
/* WATCHER */
class Watcher extends events_1.EventEmitter {
    /* CONSTRUCTOR */
    constructor(target, options, handler) {
        super();
        this._closed = false;
        this._ready = false;
        this._closeAborter = new aborter_1.default();
        this._closeSignal = this._closeAborter.signal;
        this.on("close" /* WatcherEvent.CLOSE */, () => this._closeAborter.abort());
        this._closeWait = new Promise(resolve => this.on("close" /* WatcherEvent.CLOSE */, resolve));
        this._readyWait = new Promise(resolve => this.on("ready" /* WatcherEvent.READY */, resolve));
        this._locker = new watcher_locker_1.default(this);
        this._roots = new Set();
        this._poller = new watcher_poller_1.default();
        this._pollers = new Set();
        this._subwatchers = new Set();
        this._watchers = {};
        this._watchersLock = Promise.resolve();
        this._watchersRestorable = {};
        this.watch(target, options, handler);
    }
    /* API */
    isClosed() {
        return this._closed;
    }
    isIgnored(targetPath, ignore) {
        return !!ignore && !!ignore(targetPath);
    }
    isReady() {
        return this._ready;
    }
    close() {
        this._locker.reset();
        this._poller.reset();
        this._roots.clear();
        this.watchersClose();
        if (this.isClosed())
            return false;
        this._closed = true;
        return this.emit("close" /* WatcherEvent.CLOSE */);
    }
    error(exception) {
        if (this.isClosed())
            return false;
        const error = utils_1.default.lang.castError(exception);
        return this.emit("error" /* WatcherEvent.ERROR */, error);
    }
    event(event, targetPath, targetPathNext) {
        if (this.isClosed())
            return false;
        this.emit("all" /* WatcherEvent.ALL */, event, targetPath, targetPathNext);
        return this.emit(event, targetPath, targetPathNext);
    }
    ready() {
        if (this.isClosed() || this.isReady())
            return false;
        this._ready = true;
        return this.emit("ready" /* WatcherEvent.READY */);
    }
    pollerExists(targetPath, options) {
        for (const poller of this._pollers) {
            if (poller.targetPath !== targetPath)
                continue;
            if (!utils_1.default.lang.areShallowEqual(poller.options, options))
                continue;
            return true;
        }
        return false;
    }
    subwatcherExists(targetPath, options) {
        for (const subwatcher of this._subwatchers) {
            if (subwatcher.targetPath !== targetPath)
                continue;
            if (!utils_1.default.lang.areShallowEqual(subwatcher.options, options))
                continue;
            return true;
        }
        return false;
    }
    watchersClose(folderPath, filePath, recursive = true) {
        if (!folderPath) {
            for (const folderPath in this._watchers) {
                this.watchersClose(folderPath, filePath, false);
            }
        }
        else {
            const configs = this._watchers[folderPath];
            if (configs) {
                for (const config of configs) {
                    if (filePath && config.filePath !== filePath)
                        continue;
                    this.watcherClose(config);
                }
            }
            if (recursive) {
                for (const folderPathOther in this._watchers) {
                    if (!utils_1.default.fs.isSubPath(folderPath, folderPathOther))
                        continue;
                    this.watchersClose(folderPathOther, filePath, false);
                }
            }
        }
    }
    watchersLock(callback) {
        return this._watchersLock.then(() => {
            return this._watchersLock = new Promise(async (resolve) => {
                await callback();
                resolve();
            });
        });
    }
    watchersRestore() {
        delete this._watchersRestoreTimeout;
        const watchers = Object.entries(this._watchersRestorable);
        this._watchersRestorable = {};
        for (const [targetPath, config] of watchers) {
            this.watchPath(targetPath, config.options, config.handler);
        }
    }
    async watcherAdd(config, baseWatcherHandler) {
        const { folderPath } = config;
        const configs = this._watchers[folderPath] = (this._watchers[folderPath] || []);
        configs.push(config);
        const watcherHandler = new watcher_handler_1.default(this, config, baseWatcherHandler);
        await watcherHandler.init();
        return watcherHandler;
    }
    watcherClose(config) {
        config.watcher.close();
        const configs = this._watchers[config.folderPath];
        if (configs) {
            const index = configs.indexOf(config);
            configs.splice(index, 1);
            if (!configs.length) {
                delete this._watchers[config.folderPath];
            }
        }
        const rootPath = config.filePath || config.folderPath, isRoot = this._roots.has(rootPath);
        if (isRoot) {
            this._watchersRestorable[rootPath] = config;
            if (!this._watchersRestoreTimeout) {
                this._watchersRestoreTimeout = utils_1.default.lang.defer(() => this.watchersRestore());
            }
        }
    }
    watcherExists(folderPath, options, handler, filePath) {
        const configsSibling = this._watchers[folderPath];
        if (!!(configsSibling === null || configsSibling === void 0 ? void 0 : configsSibling.find(config => config.handler === handler && (!config.filePath || config.filePath === filePath) && config.options.ignore === options.ignore && !!config.options.native === !!options.native && (!options.recursive || config.options.recursive))))
            return true;
        let folderAncestorPath = path_1.default.dirname(folderPath);
        for (let depth = 1; depth < Infinity; depth++) {
            const configsAncestor = this._watchers[folderAncestorPath];
            if (!!(configsAncestor === null || configsAncestor === void 0 ? void 0 : configsAncestor.find(config => { var _a; return (depth === 1 || (config.options.recursive && depth <= ((_a = config.options.depth) !== null && _a !== void 0 ? _a : constants_1.DEPTH))) && config.handler === handler && (!config.filePath || config.filePath === filePath) && config.options.ignore === options.ignore && !!config.options.native === !!options.native && (!options.recursive || (config.options.recursive && (constants_1.HAS_NATIVE_RECURSION && config.options.native !== false))); })))
                return true;
            if (!constants_1.HAS_NATIVE_RECURSION)
                break; // No other ancestor will possibly be found
            const folderAncestorPathNext = path_1.default.dirname(folderPath);
            if (folderAncestorPath === folderAncestorPathNext)
                break;
            folderAncestorPath = folderAncestorPathNext;
        }
        return false;
    }
    async watchDirectories(foldersPaths, options, handler, filePath, baseWatcherHandler) {
        if (this.isClosed())
            return;
        foldersPaths = utils_1.default.lang.uniq(foldersPaths).sort();
        let watcherHandlerLast;
        for (const folderPath of foldersPaths) {
            if (this.isIgnored(folderPath, options.ignore))
                continue;
            if (this.watcherExists(folderPath, options, handler, filePath))
                continue;
            try {
                const watcherOptions = (!options.recursive || (constants_1.HAS_NATIVE_RECURSION && options.native !== false)) ? options : { ...options, recursive: false }, // Ensuring recursion is explicitly disabled if not available
                watcher = fs_1.default.watch(folderPath, watcherOptions), watcherConfig = { watcher, handler, options, folderPath, filePath }, watcherHandler = watcherHandlerLast = await this.watcherAdd(watcherConfig, baseWatcherHandler);
                const isRoot = this._roots.has(filePath || folderPath);
                if (isRoot) {
                    const parentOptions = { ...options, ignoreInitial: true, recursive: false }, // Ensuring only the parent folder is being watched
                    parentFolderPath = path_1.default.dirname(folderPath), parentFilePath = folderPath;
                    await this.watchDirectories([parentFolderPath], parentOptions, handler, parentFilePath, watcherHandler);
                    //TODO: Watch parents recursively with the following code, which requires other things to be changed too though
                    // while ( true ) {
                    //   await this.watchDirectories ( [parentFolderPath], parentOptions, handler, parentFilePath, watcherHandler );
                    //   const parentFolderPathNext = path.dirname ( parentFolderPath );
                    //   if ( parentFolderPath === parentFolderPathNext ) break;
                    //   parentFilePath = parentFolderPath;
                    //   parentFolderPath = parentFolderPathNext;
                    // }
                }
            }
            catch (error) {
                this.error(error);
            }
        }
        return watcherHandlerLast;
    }
    async watchDirectory(folderPath, options, handler, filePath, baseWatcherHandler) {
        var _a;
        if (this.isClosed())
            return;
        if (this.isIgnored(folderPath, options.ignore))
            return;
        if (!options.recursive || (constants_1.HAS_NATIVE_RECURSION && options.native !== false)) {
            return this.watchersLock(() => {
                return this.watchDirectories([folderPath], options, handler, filePath, baseWatcherHandler);
            });
        }
        else {
            options = { ...options, recursive: true }; // Ensuring recursion is explicitly enabled
            const depth = (_a = options.depth) !== null && _a !== void 0 ? _a : constants_1.DEPTH, [folderSubPaths] = await utils_1.default.fs.readdir(folderPath, options.ignore, depth, this._closeSignal, options.readdirMap);
            return this.watchersLock(async () => {
                const watcherHandler = await this.watchDirectories([folderPath], options, handler, filePath, baseWatcherHandler);
                if (folderSubPaths.length) {
                    const folderPathDepth = (0, string_indexes_1.default)(folderPath, path_1.default.sep).length;
                    for (const folderSubPath of folderSubPaths) {
                        const folderSubPathDepth = (0, string_indexes_1.default)(folderSubPath, path_1.default.sep).length, subDepth = Math.max(0, depth - (folderSubPathDepth - folderPathDepth)), subOptions = { ...options, depth: subDepth }; // Updating the maximum depth to account for depth of the sub path
                        await this.watchDirectories([folderSubPath], subOptions, handler, filePath, baseWatcherHandler || watcherHandler);
                    }
                }
            });
        }
    }
    async watchFileOnce(filePath, options, callback) {
        if (this.isClosed())
            return;
        options = { ...options, ignoreInitial: false }; // Ensuring initial events are detected too
        if (this.subwatcherExists(filePath, options))
            return;
        const config = { targetPath: filePath, options };
        const handler = (event, targetPath) => {
            if (targetPath !== filePath)
                return;
            stop();
            callback();
        };
        const watcher = new Watcher(handler);
        const start = () => {
            this._subwatchers.add(config);
            this.on("close" /* WatcherEvent.CLOSE */, stop); // Ensuring the subwatcher is stopped on close
            watcher.watchFile(filePath, options, handler);
        };
        const stop = () => {
            this._subwatchers.delete(config);
            this.removeListener("close" /* WatcherEvent.CLOSE */, stop); // Ensuring there are no leftover listeners
            watcher.close();
        };
        return start();
    }
    async watchFile(filePath, options, handler) {
        if (this.isClosed())
            return;
        if (this.isIgnored(filePath, options.ignore))
            return;
        options = { ...options, recursive: false }; // Ensuring recursion is explicitly disabled
        const folderPath = path_1.default.dirname(filePath);
        return this.watchDirectory(folderPath, options, handler, filePath);
    }
    async watchPollingOnce(targetPath, options, callback) {
        if (this.isClosed())
            return;
        let isDone = false;
        const poller = new watcher_poller_1.default();
        const disposer = await this.watchPolling(targetPath, options, async () => {
            if (isDone)
                return;
            const events = await poller.update(targetPath, options.pollingTimeout);
            if (!events.length)
                return; // Nothing actually changed, skipping
            if (isDone)
                return; // Another async callback has done the work already, skipping
            isDone = true;
            disposer();
            callback();
        });
    }
    async watchPolling(targetPath, options, callback) {
        var _a;
        if (this.isClosed())
            return utils_1.default.lang.noop;
        if (this.pollerExists(targetPath, options))
            return utils_1.default.lang.noop;
        const watcherOptions = { ...options, interval: (_a = options.pollingInterval) !== null && _a !== void 0 ? _a : constants_1.POLLING_INTERVAL }; // Ensuring a default interval is set
        const config = { targetPath, options };
        const start = () => {
            this._pollers.add(config);
            this.on("close" /* WatcherEvent.CLOSE */, stop); // Ensuring polling is stopped on close
            fs_1.default.watchFile(targetPath, watcherOptions, callback);
        };
        const stop = () => {
            this._pollers.delete(config);
            this.removeListener("close" /* WatcherEvent.CLOSE */, stop); // Ensuring there are no leftover listeners
            fs_1.default.unwatchFile(targetPath, callback);
        };
        utils_1.default.lang.attempt(start);
        return () => utils_1.default.lang.attempt(stop);
    }
    async watchUnknownChild(targetPath, options, handler) {
        if (this.isClosed())
            return;
        const watch = () => this.watchPath(targetPath, options, handler);
        return this.watchFileOnce(targetPath, options, watch);
    }
    async watchUnknownTarget(targetPath, options, handler) {
        if (this.isClosed())
            return;
        const watch = () => this.watchPath(targetPath, options, handler);
        return this.watchPollingOnce(targetPath, options, watch);
    }
    async watchPaths(targetPaths, options, handler) {
        if (this.isClosed())
            return;
        targetPaths = utils_1.default.lang.uniq(targetPaths).sort();
        const isParallelizable = targetPaths.every((targetPath, index) => targetPaths.every((t, i) => i === index || !utils_1.default.fs.isSubPath(targetPath, t))); // All paths are about separate subtrees, so we can start watching in parallel safely //TODO: Find parallelizable chunks rather than using an all or nothing approach
        if (isParallelizable) { // Watching in parallel
            await Promise.all(targetPaths.map(targetPath => {
                return this.watchPath(targetPath, options, handler);
            }));
        }
        else { // Watching serially
            for (const targetPath of targetPaths) {
                await this.watchPath(targetPath, options, handler);
            }
        }
    }
    async watchPath(targetPath, options, handler) {
        if (this.isClosed())
            return;
        targetPath = path_1.default.normalize(targetPath);
        if (this.isIgnored(targetPath, options.ignore))
            return;
        const stats = await utils_1.default.fs.poll(targetPath, options.pollingTimeout);
        if (!stats) {
            const parentPath = path_1.default.dirname(targetPath), parentStats = await utils_1.default.fs.poll(parentPath, options.pollingTimeout);
            if (parentStats === null || parentStats === void 0 ? void 0 : parentStats.isDirectory()) {
                return this.watchUnknownChild(targetPath, options, handler);
            }
            else {
                return this.watchUnknownTarget(targetPath, options, handler);
            }
        }
        else if (stats.isFile()) {
            return this.watchFile(targetPath, options, handler);
        }
        else if (stats.isDirectory()) {
            return this.watchDirectory(targetPath, options, handler);
        }
        else {
            this.error(`"${targetPath}" is not supported`);
        }
    }
    async watch(target, options, handler = utils_1.default.lang.noop) {
        if (utils_1.default.lang.isFunction(target))
            return this.watch([], {}, target);
        if (utils_1.default.lang.isUndefined(target))
            return this.watch([], options, handler);
        if (utils_1.default.lang.isFunction(options))
            return this.watch(target, {}, options);
        if (utils_1.default.lang.isUndefined(options))
            return this.watch(target, {}, handler);
        if (this.isClosed())
            return;
        if (this.isReady())
            options.readdirMap = undefined; // Only usable before initialization
        const targetPaths = utils_1.default.lang.castArray(target);
        targetPaths.forEach(targetPath => this._roots.add(targetPath));
        await this.watchPaths(targetPaths, options, handler);
        if (this.isClosed())
            return;
        if (handler !== utils_1.default.lang.noop) {
            this.on("all" /* WatcherEvent.ALL */, handler);
        }
        options.readdirMap = undefined; // Only usable before initialization
        this.ready();
    }
}
/* EXPORT */
module.exports = Watcher;
module.exports.default = Watcher;
Object.defineProperty(module.exports, "__esModule", { value: true });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy93YXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFDQSxZQUFZOzs7OztBQUVaLHNEQUE4QjtBQUM5QixtQ0FBb0M7QUFDcEMsNENBQW9CO0FBQ3BCLGdEQUF3QjtBQUN4QixvRUFBMkM7QUFDM0MsMkNBQTBFO0FBRTFFLHdFQUErQztBQUMvQyxzRUFBNkM7QUFDN0Msc0VBQTZDO0FBQzdDLG9EQUE0QjtBQUc1QixhQUFhO0FBRWIsTUFBTSxPQUFRLFNBQVEscUJBQVk7SUFvQmhDLGlCQUFpQjtJQUVqQixZQUFjLE1BQWdDLEVBQUUsT0FBa0MsRUFBRSxPQUFpQjtRQUVuRyxLQUFLLEVBQUcsQ0FBQztRQUVULElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxpQkFBTyxFQUFHLENBQUM7UUFDcEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQztRQUM5QyxJQUFJLENBQUMsRUFBRSxtQ0FBdUIsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUcsQ0FBRSxDQUFDO1FBQ2xFLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxPQUFPLENBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxtQ0FBdUIsT0FBTyxDQUFFLENBQUUsQ0FBQztRQUNyRixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxDQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsbUNBQXVCLE9BQU8sQ0FBRSxDQUFFLENBQUM7UUFDckYsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLHdCQUFhLENBQUcsSUFBSSxDQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSx3QkFBYSxFQUFHLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBRyxDQUFDO1FBQzNCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQUcsQ0FBQztRQUMvQixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxPQUFPLEVBQUcsQ0FBQztRQUN4QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxDQUFDO1FBRTlCLElBQUksQ0FBQyxLQUFLLENBQUcsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUUsQ0FBQztJQUUxQyxDQUFDO0lBRUQsU0FBUztJQUVULFFBQVE7UUFFTixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFFdEIsQ0FBQztJQUVELFNBQVMsQ0FBRyxVQUFnQixFQUFFLE1BQWU7UUFFM0MsT0FBTyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUcsVUFBVSxDQUFFLENBQUM7SUFFN0MsQ0FBQztJQUVELE9BQU87UUFFTCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFFckIsQ0FBQztJQUVELEtBQUs7UUFFSCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFHLENBQUM7UUFDdEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUcsQ0FBQztRQUVyQixJQUFJLENBQUMsYUFBYSxFQUFHLENBQUM7UUFFdEIsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTyxLQUFLLENBQUM7UUFFckMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFFcEIsT0FBTyxJQUFJLENBQUMsSUFBSSxrQ0FBdUIsQ0FBQztJQUUxQyxDQUFDO0lBRUQsS0FBSyxDQUFHLFNBQWtCO1FBRXhCLElBQUssSUFBSSxDQUFDLFFBQVEsRUFBRztZQUFHLE9BQU8sS0FBSyxDQUFDO1FBRXJDLE1BQU0sS0FBSyxHQUFHLGVBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFHLFNBQVMsQ0FBRSxDQUFDO1FBRWpELE9BQU8sSUFBSSxDQUFDLElBQUksbUNBQXVCLEtBQUssQ0FBRSxDQUFDO0lBRWpELENBQUM7SUFFRCxLQUFLLENBQUcsS0FBa0IsRUFBRSxVQUFnQixFQUFFLGNBQXFCO1FBRWpFLElBQUssSUFBSSxDQUFDLFFBQVEsRUFBRztZQUFHLE9BQU8sS0FBSyxDQUFDO1FBRXJDLElBQUksQ0FBQyxJQUFJLCtCQUFxQixLQUFLLEVBQUUsVUFBVSxFQUFFLGNBQWMsQ0FBRSxDQUFDO1FBRWxFLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBRyxLQUFLLEVBQUUsVUFBVSxFQUFFLGNBQWMsQ0FBRSxDQUFDO0lBRXpELENBQUM7SUFFRCxLQUFLO1FBRUgsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRztZQUFHLE9BQU8sS0FBSyxDQUFDO1FBRXhELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBRW5CLE9BQU8sSUFBSSxDQUFDLElBQUksa0NBQXVCLENBQUM7SUFFMUMsQ0FBQztJQUVELFlBQVksQ0FBRyxVQUFnQixFQUFFLE9BQXVCO1FBRXRELEtBQU0sTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRztZQUVwQyxJQUFLLE1BQU0sQ0FBQyxVQUFVLEtBQUssVUFBVTtnQkFBRyxTQUFTO1lBRWpELElBQUssQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBRyxNQUFNLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBRTtnQkFBRyxTQUFTO1lBRXhFLE9BQU8sSUFBSSxDQUFDO1NBRWI7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUVmLENBQUM7SUFFRCxnQkFBZ0IsQ0FBRyxVQUFnQixFQUFFLE9BQXVCO1FBRTFELEtBQU0sTUFBTSxVQUFVLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRztZQUU1QyxJQUFLLFVBQVUsQ0FBQyxVQUFVLEtBQUssVUFBVTtnQkFBRyxTQUFTO1lBRXJELElBQUssQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBRyxVQUFVLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBRTtnQkFBRyxTQUFTO1lBRTVFLE9BQU8sSUFBSSxDQUFDO1NBRWI7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUVmLENBQUM7SUFFRCxhQUFhLENBQUcsVUFBaUIsRUFBRSxRQUFlLEVBQUUsWUFBcUIsSUFBSTtRQUUzRSxJQUFLLENBQUMsVUFBVSxFQUFHO1lBRWpCLEtBQU0sTUFBTSxVQUFVLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRztnQkFFekMsSUFBSSxDQUFDLGFBQWEsQ0FBRyxVQUFVLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBRSxDQUFDO2FBRXBEO1NBRUY7YUFBTTtZQUVMLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsSUFBSyxPQUFPLEVBQUc7Z0JBRWIsS0FBTSxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUc7b0JBRTlCLElBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxRQUFRLEtBQUssUUFBUTt3QkFBRyxTQUFTO29CQUV6RCxJQUFJLENBQUMsWUFBWSxDQUFHLE1BQU0sQ0FBRSxDQUFDO2lCQUU5QjthQUVGO1lBRUQsSUFBSyxTQUFTLEVBQUc7Z0JBRWYsS0FBTSxNQUFNLGVBQWUsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFHO29CQUU5QyxJQUFLLENBQUMsZUFBSyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUcsVUFBVSxFQUFFLGVBQWUsQ0FBRTt3QkFBRyxTQUFTO29CQUVwRSxJQUFJLENBQUMsYUFBYSxDQUFHLGVBQWUsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFFLENBQUM7aUJBRXpEO2FBRUY7U0FFRjtJQUVILENBQUM7SUFFRCxZQUFZLENBQUcsUUFBa0I7UUFFL0IsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBRyxHQUFHLEVBQUU7WUFFcEMsT0FBTyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksT0FBTyxDQUFHLEtBQUssRUFBQyxPQUFPLEVBQUMsRUFBRTtnQkFFeEQsTUFBTSxRQUFRLEVBQUcsQ0FBQztnQkFFbEIsT0FBTyxFQUFHLENBQUM7WUFFYixDQUFDLENBQUMsQ0FBQztRQUVMLENBQUMsQ0FBQyxDQUFDO0lBRUwsQ0FBQztJQUVELGVBQWU7UUFFYixPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztRQUVwQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBRSxDQUFDO1FBRTdELElBQUksQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLENBQUM7UUFFOUIsS0FBTSxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJLFFBQVEsRUFBRztZQUU3QyxJQUFJLENBQUMsU0FBUyxDQUFHLFVBQVUsRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUUsQ0FBQztTQUUvRDtJQUVILENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVSxDQUFHLE1BQXFCLEVBQUUsa0JBQW1DO1FBRTNFLE1BQU0sRUFBQyxVQUFVLEVBQUMsR0FBRyxNQUFNLENBQUM7UUFFNUIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFFLENBQUM7UUFFbEYsT0FBTyxDQUFDLElBQUksQ0FBRyxNQUFNLENBQUUsQ0FBQztRQUV4QixNQUFNLGNBQWMsR0FBRyxJQUFJLHlCQUFjLENBQUcsSUFBSSxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsQ0FBRSxDQUFDO1FBRS9FLE1BQU0sY0FBYyxDQUFDLElBQUksRUFBRyxDQUFDO1FBRTdCLE9BQU8sY0FBYyxDQUFDO0lBRXhCLENBQUM7SUFFRCxZQUFZLENBQUcsTUFBcUI7UUFFbEMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUcsQ0FBQztRQUV4QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVsRCxJQUFLLE9BQU8sRUFBRztZQUViLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUcsTUFBTSxDQUFFLENBQUM7WUFFekMsT0FBTyxDQUFDLE1BQU0sQ0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFFLENBQUM7WUFFNUIsSUFBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUc7Z0JBRXJCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7YUFFMUM7U0FFRjtRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFDLFVBQVUsRUFDL0MsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFHLFFBQVEsQ0FBRSxDQUFDO1FBRTVDLElBQUssTUFBTSxFQUFHO1lBRVosSUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUU1QyxJQUFLLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFHO2dCQUVuQyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsZUFBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUcsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRyxDQUFFLENBQUM7YUFFbkY7U0FFRjtJQUVILENBQUM7SUFFRCxhQUFhLENBQUcsVUFBZ0IsRUFBRSxPQUF1QixFQUFFLE9BQWdCLEVBQUUsUUFBZTtRQUUxRixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWxELElBQUssQ0FBQyxDQUFDLENBQUEsY0FBYyxhQUFkLGNBQWMsdUJBQWQsY0FBYyxDQUFFLElBQUksQ0FBRyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEtBQUssT0FBTyxJQUFJLENBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFFLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBRSxDQUFDLE9BQU8sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUUsQ0FBRSxDQUFBO1lBQUcsT0FBTyxJQUFJLENBQUM7UUFFN1IsSUFBSSxrQkFBa0IsR0FBRyxjQUFJLENBQUMsT0FBTyxDQUFHLFVBQVUsQ0FBRSxDQUFDO1FBRXJELEtBQU0sSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUc7WUFFL0MsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBRTNELElBQUssQ0FBQyxDQUFDLENBQUEsZUFBZSxhQUFmLGVBQWUsdUJBQWYsZUFBZSxDQUFFLElBQUksQ0FBRyxNQUFNLENBQUMsRUFBRSxXQUFDLE9BQUEsQ0FBRSxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLElBQUksS0FBSyxJQUFJLENBQUUsTUFBQSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssbUNBQUksaUJBQUssQ0FBRSxDQUFFLENBQUUsSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLE9BQU8sSUFBSSxDQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxNQUFNLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBRSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxJQUFJLENBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLElBQUksQ0FBRSxnQ0FBb0IsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxLQUFLLENBQUUsQ0FBRSxDQUFFLENBQUEsRUFBQSxDQUFFLENBQUE7Z0JBQUcsT0FBTyxJQUFJLENBQUM7WUFFbGMsSUFBSyxDQUFDLGdDQUFvQjtnQkFBRyxNQUFNLENBQUMsMkNBQTJDO1lBRS9FLE1BQU0sc0JBQXNCLEdBQUcsY0FBSSxDQUFDLE9BQU8sQ0FBRyxVQUFVLENBQUUsQ0FBQztZQUUzRCxJQUFLLGtCQUFrQixLQUFLLHNCQUFzQjtnQkFBRyxNQUFNO1lBRTNELGtCQUFrQixHQUFHLHNCQUFzQixDQUFDO1NBRTdDO1FBRUQsT0FBTyxLQUFLLENBQUM7SUFFZixDQUFDO0lBRUQsS0FBSyxDQUFDLGdCQUFnQixDQUFHLFlBQW9CLEVBQUUsT0FBdUIsRUFBRSxPQUFnQixFQUFFLFFBQWUsRUFBRSxrQkFBbUM7UUFFNUksSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTztRQUUvQixZQUFZLEdBQUcsZUFBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUcsWUFBWSxDQUFFLENBQUMsSUFBSSxFQUFHLENBQUM7UUFFeEQsSUFBSSxrQkFBOEMsQ0FBQztRQUVuRCxLQUFNLE1BQU0sVUFBVSxJQUFJLFlBQVksRUFBRztZQUV2QyxJQUFLLElBQUksQ0FBQyxTQUFTLENBQUcsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUU7Z0JBQUcsU0FBUztZQUU5RCxJQUFLLElBQUksQ0FBQyxhQUFhLENBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFFO2dCQUFHLFNBQVM7WUFFOUUsSUFBSTtnQkFFRixNQUFNLGNBQWMsR0FBRyxDQUFFLENBQUMsT0FBTyxDQUFDLFNBQVMsSUFBSSxDQUFFLGdDQUFvQixJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssS0FBSyxDQUFFLENBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSw2REFBNkQ7Z0JBQzNNLE9BQU8sR0FBRyxZQUFFLENBQUMsS0FBSyxDQUFHLFVBQVUsRUFBRSxjQUFjLENBQUUsRUFDakQsYUFBYSxHQUFrQixFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsRUFDbEYsY0FBYyxHQUFHLGtCQUFrQixHQUFHLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBRyxhQUFhLEVBQUUsa0JBQWtCLENBQUUsQ0FBQztnQkFFeEcsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUcsUUFBUSxJQUFJLFVBQVUsQ0FBRSxDQUFDO2dCQUUxRCxJQUFLLE1BQU0sRUFBRztvQkFFWixNQUFNLGFBQWEsR0FBbUIsRUFBRSxHQUFHLE9BQU8sRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxtREFBbUQ7b0JBQzFJLGdCQUFnQixHQUFHLGNBQUksQ0FBQyxPQUFPLENBQUcsVUFBVSxDQUFFLEVBQzlDLGNBQWMsR0FBRyxVQUFVLENBQUM7b0JBRWxDLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFHLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLENBQUUsQ0FBQztvQkFFM0csK0dBQStHO29CQUUvRyxtQkFBbUI7b0JBRW5CLGdIQUFnSDtvQkFFaEgsb0VBQW9FO29CQUVwRSw0REFBNEQ7b0JBRTVELHVDQUF1QztvQkFDdkMsNkNBQTZDO29CQUU3QyxJQUFJO2lCQUVMO2FBRUY7WUFBQyxPQUFRLEtBQWMsRUFBRztnQkFFekIsSUFBSSxDQUFDLEtBQUssQ0FBRyxLQUFLLENBQUUsQ0FBQzthQUV0QjtTQUVGO1FBRUQsT0FBTyxrQkFBa0IsQ0FBQztJQUU1QixDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBRyxVQUFnQixFQUFFLE9BQXVCLEVBQUUsT0FBZ0IsRUFBRSxRQUFlLEVBQUUsa0JBQW1DOztRQUV0SSxJQUFLLElBQUksQ0FBQyxRQUFRLEVBQUc7WUFBRyxPQUFPO1FBRS9CLElBQUssSUFBSSxDQUFDLFNBQVMsQ0FBRyxVQUFVLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBRTtZQUFHLE9BQU87UUFFNUQsSUFBSyxDQUFDLE9BQU8sQ0FBQyxTQUFTLElBQUksQ0FBRSxnQ0FBb0IsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLEtBQUssQ0FBRSxFQUFHO1lBRWhGLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBRyxHQUFHLEVBQUU7Z0JBRTlCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsa0JBQWtCLENBQUUsQ0FBQztZQUVoRyxDQUFDLENBQUMsQ0FBQztTQUVKO2FBQU07WUFFTCxPQUFPLEdBQUcsRUFBRSxHQUFHLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQywyQ0FBMkM7WUFFdEYsTUFBTSxLQUFLLEdBQUcsTUFBQSxPQUFPLENBQUMsS0FBSyxtQ0FBSSxpQkFBSyxFQUM5QixDQUFDLGNBQWMsQ0FBQyxHQUFHLE1BQU0sZUFBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUcsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBRSxDQUFDO1lBRTdILE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBRyxLQUFLLElBQUksRUFBRTtnQkFFcEMsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLENBQUcsQ0FBQyxVQUFVLENBQUMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxrQkFBa0IsQ0FBRSxDQUFDO2dCQUVwSCxJQUFLLGNBQWMsQ0FBQyxNQUFNLEVBQUc7b0JBRTNCLE1BQU0sZUFBZSxHQUFHLElBQUEsd0JBQWEsRUFBRyxVQUFVLEVBQUUsY0FBSSxDQUFDLEdBQUcsQ0FBRSxDQUFDLE1BQU0sQ0FBQztvQkFFdEUsS0FBTSxNQUFNLGFBQWEsSUFBSSxjQUFjLEVBQUc7d0JBRTVDLE1BQU0sa0JBQWtCLEdBQUcsSUFBQSx3QkFBYSxFQUFHLGFBQWEsRUFBRSxjQUFJLENBQUMsR0FBRyxDQUFFLENBQUMsTUFBTSxFQUNyRSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUUsa0JBQWtCLEdBQUcsZUFBZSxDQUFFLENBQUUsRUFDM0UsVUFBVSxHQUFHLEVBQUUsR0FBRyxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsa0VBQWtFO3dCQUV0SCxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLGtCQUFrQixJQUFJLGNBQWMsQ0FBRSxDQUFDO3FCQUV0SDtpQkFFRjtZQUVILENBQUMsQ0FBQyxDQUFDO1NBRUo7SUFFSCxDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBRyxRQUFjLEVBQUUsT0FBdUIsRUFBRSxRQUFrQjtRQUUvRSxJQUFLLElBQUksQ0FBQyxRQUFRLEVBQUc7WUFBRyxPQUFPO1FBRS9CLE9BQU8sR0FBRyxFQUFFLEdBQUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLDJDQUEyQztRQUUzRixJQUFLLElBQUksQ0FBQyxnQkFBZ0IsQ0FBRyxRQUFRLEVBQUUsT0FBTyxDQUFFO1lBQUcsT0FBTztRQUUxRCxNQUFNLE1BQU0sR0FBcUIsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBRW5FLE1BQU0sT0FBTyxHQUFHLENBQUUsS0FBa0IsRUFBRSxVQUFnQixFQUFHLEVBQUU7WUFDekQsSUFBSyxVQUFVLEtBQUssUUFBUTtnQkFBRyxPQUFPO1lBQ3RDLElBQUksRUFBRyxDQUFDO1lBQ1IsUUFBUSxFQUFHLENBQUM7UUFDZCxDQUFDLENBQUM7UUFFRixNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sQ0FBRyxPQUFPLENBQUUsQ0FBQztRQUV4QyxNQUFNLEtBQUssR0FBRyxHQUFTLEVBQUU7WUFDdkIsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUcsTUFBTSxDQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLEVBQUUsbUNBQXVCLElBQUksQ0FBRSxDQUFDLENBQUMsOENBQThDO1lBQ3BGLE9BQU8sQ0FBQyxTQUFTLENBQUcsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUUsQ0FBQztRQUNuRCxDQUFDLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxHQUFTLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUcsTUFBTSxDQUFFLENBQUM7WUFDcEMsSUFBSSxDQUFDLGNBQWMsbUNBQXVCLElBQUksQ0FBRSxDQUFDLENBQUMsMkNBQTJDO1lBQzdGLE9BQU8sQ0FBQyxLQUFLLEVBQUcsQ0FBQztRQUNuQixDQUFDLENBQUM7UUFFRixPQUFPLEtBQUssRUFBRyxDQUFDO0lBRWxCLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFHLFFBQWMsRUFBRSxPQUF1QixFQUFFLE9BQWdCO1FBRXpFLElBQUssSUFBSSxDQUFDLFFBQVEsRUFBRztZQUFHLE9BQU87UUFFL0IsSUFBSyxJQUFJLENBQUMsU0FBUyxDQUFHLFFBQVEsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFFO1lBQUcsT0FBTztRQUUxRCxPQUFPLEdBQUcsRUFBRSxHQUFHLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyw0Q0FBNEM7UUFFeEYsTUFBTSxVQUFVLEdBQUcsY0FBSSxDQUFDLE9BQU8sQ0FBRyxRQUFRLENBQUUsQ0FBQztRQUU3QyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFFLENBQUM7SUFFeEUsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBRyxVQUFnQixFQUFFLE9BQXVCLEVBQUUsUUFBa0I7UUFFcEYsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTztRQUUvQixJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFFbkIsTUFBTSxNQUFNLEdBQUcsSUFBSSx3QkFBYSxFQUFHLENBQUM7UUFFcEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFFekUsSUFBSyxNQUFNO2dCQUFHLE9BQU87WUFFckIsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFHLFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFFLENBQUM7WUFFMUUsSUFBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO2dCQUFHLE9BQU8sQ0FBQyxxQ0FBcUM7WUFFbkUsSUFBSyxNQUFNO2dCQUFHLE9BQU8sQ0FBQyw2REFBNkQ7WUFFbkYsTUFBTSxHQUFHLElBQUksQ0FBQztZQUVkLFFBQVEsRUFBRyxDQUFDO1lBRVosUUFBUSxFQUFHLENBQUM7UUFFZCxDQUFDLENBQUMsQ0FBQztJQUVMLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWSxDQUFHLFVBQWdCLEVBQUUsT0FBdUIsRUFBRSxRQUFrQjs7UUFFaEYsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTyxlQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUUvQyxJQUFLLElBQUksQ0FBQyxZQUFZLENBQUcsVUFBVSxFQUFFLE9BQU8sQ0FBRTtZQUFHLE9BQU8sZUFBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFFeEUsTUFBTSxjQUFjLEdBQUcsRUFBRSxHQUFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBQSxPQUFPLENBQUMsZUFBZSxtQ0FBSSw0QkFBZ0IsRUFBRSxDQUFDLENBQUMscUNBQXFDO1FBRW5JLE1BQU0sTUFBTSxHQUFpQixFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUVyRCxNQUFNLEtBQUssR0FBRyxHQUFTLEVBQUU7WUFDdkIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUcsTUFBTSxDQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLEVBQUUsbUNBQXVCLElBQUksQ0FBRSxDQUFDLENBQUMsdUNBQXVDO1lBQzdFLFlBQUUsQ0FBQyxTQUFTLENBQUcsVUFBVSxFQUFFLGNBQWMsRUFBRSxRQUFRLENBQUUsQ0FBQztRQUN4RCxDQUFDLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxHQUFTLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUcsTUFBTSxDQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLGNBQWMsbUNBQXVCLElBQUksQ0FBRSxDQUFDLENBQUMsMkNBQTJDO1lBQzdGLFlBQUUsQ0FBQyxXQUFXLENBQUcsVUFBVSxFQUFFLFFBQVEsQ0FBRSxDQUFDO1FBQzFDLENBQUMsQ0FBQztRQUVGLGVBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFHLEtBQUssQ0FBRSxDQUFDO1FBRTdCLE9BQU8sR0FBRyxFQUFFLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUcsSUFBSSxDQUFFLENBQUM7SUFFM0MsQ0FBQztJQUVELEtBQUssQ0FBQyxpQkFBaUIsQ0FBRyxVQUFnQixFQUFFLE9BQXVCLEVBQUUsT0FBZ0I7UUFFbkYsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTztRQUUvQixNQUFNLEtBQUssR0FBRyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFFLENBQUM7UUFFcEUsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFFLENBQUM7SUFFM0QsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBRyxVQUFnQixFQUFFLE9BQXVCLEVBQUUsT0FBZ0I7UUFFcEYsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTztRQUUvQixNQUFNLEtBQUssR0FBRyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFFLENBQUM7UUFFcEUsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUUsQ0FBQztJQUU5RCxDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVUsQ0FBRyxXQUFtQixFQUFFLE9BQXVCLEVBQUUsT0FBZ0I7UUFFL0UsSUFBSyxJQUFJLENBQUMsUUFBUSxFQUFHO1lBQUcsT0FBTztRQUUvQixXQUFXLEdBQUcsZUFBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUcsV0FBVyxDQUFFLENBQUMsSUFBSSxFQUFHLENBQUM7UUFFdEQsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFHLENBQUUsVUFBVSxFQUFFLEtBQUssRUFBRyxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBRyxDQUFFLENBQUMsRUFBRSxDQUFDLEVBQUcsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxlQUFLLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBRyxVQUFVLEVBQUUsQ0FBQyxDQUFFLENBQUUsQ0FBRSxDQUFDLENBQUMscUtBQXFLO1FBRXJVLElBQUssZ0JBQWdCLEVBQUcsRUFBRSx1QkFBdUI7WUFFL0MsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUcsVUFBVSxDQUFDLEVBQUU7Z0JBRWpELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBRyxVQUFVLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBRSxDQUFDO1lBRXpELENBQUMsQ0FBQyxDQUFDLENBQUM7U0FFTDthQUFNLEVBQUUsb0JBQW9CO1lBRTNCLEtBQU0sTUFBTSxVQUFVLElBQUksV0FBVyxFQUFHO2dCQUV0QyxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUUsQ0FBQzthQUV2RDtTQUVGO0lBRUgsQ0FBQztJQUVELEtBQUssQ0FBQyxTQUFTLENBQUcsVUFBZ0IsRUFBRSxPQUF1QixFQUFFLE9BQWdCO1FBRTNFLElBQUssSUFBSSxDQUFDLFFBQVEsRUFBRztZQUFHLE9BQU87UUFFL0IsVUFBVSxHQUFHLGNBQUksQ0FBQyxTQUFTLENBQUcsVUFBVSxDQUFFLENBQUM7UUFFM0MsSUFBSyxJQUFJLENBQUMsU0FBUyxDQUFHLFVBQVUsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFFO1lBQUcsT0FBTztRQUU1RCxNQUFNLEtBQUssR0FBRyxNQUFNLGVBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFHLFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFFLENBQUM7UUFFekUsSUFBSyxDQUFDLEtBQUssRUFBRztZQUVaLE1BQU0sVUFBVSxHQUFHLGNBQUksQ0FBQyxPQUFPLENBQUcsVUFBVSxDQUFFLEVBQ3hDLFdBQVcsR0FBRyxNQUFNLGVBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFHLFVBQVUsRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFFLENBQUM7WUFFL0UsSUFBSyxXQUFXLGFBQVgsV0FBVyx1QkFBWCxXQUFXLENBQUUsV0FBVyxFQUFHLEVBQUc7Z0JBRWpDLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFFLENBQUM7YUFFaEU7aUJBQU07Z0JBRUwsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUUsQ0FBQzthQUVqRTtTQUVGO2FBQU0sSUFBSyxLQUFLLENBQUMsTUFBTSxFQUFHLEVBQUc7WUFFNUIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFFLENBQUM7U0FFeEQ7YUFBTSxJQUFLLEtBQUssQ0FBQyxXQUFXLEVBQUcsRUFBRztZQUVqQyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUUsQ0FBQztTQUU3RDthQUFNO1lBRUwsSUFBSSxDQUFDLEtBQUssQ0FBRyxJQUFJLFVBQVUsb0JBQW9CLENBQUUsQ0FBQztTQUVuRDtJQUVILENBQUM7SUFFRCxLQUFLLENBQUMsS0FBSyxDQUFHLE1BQWdDLEVBQUUsT0FBa0MsRUFBRSxVQUFtQixlQUFLLENBQUMsSUFBSSxDQUFDLElBQUk7UUFFcEgsSUFBSyxlQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBRyxNQUFNLENBQUU7WUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUUsQ0FBQztRQUU3RSxJQUFLLGVBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFHLE1BQU0sQ0FBRTtZQUFHLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBRSxDQUFDO1FBRXBGLElBQUssZUFBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUcsT0FBTyxDQUFFO1lBQUcsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFHLE1BQU0sRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFFLENBQUM7UUFFbkYsSUFBSyxlQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBRyxPQUFPLENBQUU7WUFBRyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUcsTUFBTSxFQUFFLEVBQUUsRUFBRSxPQUFPLENBQUUsQ0FBQztRQUVwRixJQUFLLElBQUksQ0FBQyxRQUFRLEVBQUc7WUFBRyxPQUFPO1FBRS9CLElBQUssSUFBSSxDQUFDLE9BQU8sRUFBRztZQUFHLE9BQU8sQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDLENBQUMsb0NBQW9DO1FBRTNGLE1BQU0sV0FBVyxHQUFHLGVBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFHLE1BQU0sQ0FBRSxDQUFDO1FBRXBELFdBQVcsQ0FBQyxPQUFPLENBQUcsVUFBVSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBRyxVQUFVLENBQUUsQ0FBRSxDQUFDO1FBRXJFLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBRyxXQUFXLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBRSxDQUFDO1FBRXhELElBQUssSUFBSSxDQUFDLFFBQVEsRUFBRztZQUFHLE9BQU87UUFFL0IsSUFBSyxPQUFPLEtBQUssZUFBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUc7WUFFakMsSUFBSSxDQUFDLEVBQUUsK0JBQXFCLE9BQU8sQ0FBRSxDQUFDO1NBRXZDO1FBRUQsT0FBTyxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxvQ0FBb0M7UUFFcEUsSUFBSSxDQUFDLEtBQUssRUFBRyxDQUFDO0lBRWhCLENBQUM7Q0FFRjtBQUVELFlBQVk7QUFFWixrQkFBZSxPQUFPLENBQUMifQ==