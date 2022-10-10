"use strict";
/* IMPORT */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("./constants");
const watcher_locks_resolver_1 = __importDefault(require("./watcher_locks_resolver"));
/* WATCHER LOCKER */
//TODO: Use a better name for this thing, maybe "RenameDetector"
class WatcherLocker {
    /* CONSTRUCTOR */
    constructor(watcher) {
        this._watcher = watcher;
        this.reset();
    }
    /* API */
    getLockAdd(config, timeout = constants_1.RENAME_TIMEOUT) {
        const { ino, targetPath, events, locks } = config;
        const emit = () => {
            this._watcher.event(events.add, targetPath);
        };
        if (!ino)
            return emit();
        const cleanup = () => {
            locks.add.delete(ino);
            watcher_locks_resolver_1.default.remove(free);
        };
        const free = () => {
            cleanup();
            emit();
        };
        watcher_locks_resolver_1.default.add(free, timeout);
        const resolve = () => {
            const unlink = locks.unlink.get(ino);
            if (!unlink)
                return; // No matching "unlink" lock found, skipping
            cleanup();
            const targetPathPrev = unlink();
            if (targetPath === targetPathPrev) {
                if (events.change) {
                    if (this._watcher._poller.stats.has(targetPath)) {
                        this._watcher.event(events.change, targetPath);
                    }
                }
            }
            else {
                this._watcher.event(events.rename, targetPathPrev, targetPath);
            }
        };
        locks.add.set(ino, resolve);
        resolve();
    }
    getLockUnlink(config, timeout = constants_1.RENAME_TIMEOUT) {
        var _a;
        const { ino, targetPath, events, locks } = config;
        const emit = () => {
            this._watcher.event(events.unlink, targetPath);
        };
        if (!ino)
            return emit();
        const cleanup = () => {
            locks.unlink.delete(ino);
            watcher_locks_resolver_1.default.remove(free);
        };
        const free = () => {
            cleanup();
            emit();
        };
        watcher_locks_resolver_1.default.add(free, timeout);
        const overridden = () => {
            cleanup();
            return targetPath;
        };
        locks.unlink.set(ino, overridden);
        (_a = locks.add.get(ino)) === null || _a === void 0 ? void 0 : _a();
    }
    getLockTargetAdd(targetPath, timeout) {
        const ino = this._watcher._poller.getIno(targetPath, "add" /* TargetEvent.ADD */, 2 /* FileType.FILE */);
        return this.getLockAdd({
            ino,
            targetPath,
            events: WatcherLocker.FILE_EVENTS,
            locks: this._locksFile
        }, timeout);
    }
    getLockTargetAddDir(targetPath, timeout) {
        const ino = this._watcher._poller.getIno(targetPath, "addDir" /* TargetEvent.ADD_DIR */, 1 /* FileType.DIR */);
        return this.getLockAdd({
            ino,
            targetPath,
            events: WatcherLocker.DIR_EVENTS,
            locks: this._locksDir
        }, timeout);
    }
    getLockTargetUnlink(targetPath, timeout) {
        const ino = this._watcher._poller.getIno(targetPath, "unlink" /* TargetEvent.UNLINK */, 2 /* FileType.FILE */);
        return this.getLockUnlink({
            ino,
            targetPath,
            events: WatcherLocker.FILE_EVENTS,
            locks: this._locksFile
        }, timeout);
    }
    getLockTargetUnlinkDir(targetPath, timeout) {
        const ino = this._watcher._poller.getIno(targetPath, "unlinkDir" /* TargetEvent.UNLINK_DIR */, 1 /* FileType.DIR */);
        return this.getLockUnlink({
            ino,
            targetPath,
            events: WatcherLocker.DIR_EVENTS,
            locks: this._locksDir
        }, timeout);
    }
    reset() {
        this._locksAdd = new Map();
        this._locksAddDir = new Map();
        this._locksUnlink = new Map();
        this._locksUnlinkDir = new Map();
        this._locksDir = { add: this._locksAddDir, unlink: this._locksUnlinkDir };
        this._locksFile = { add: this._locksAdd, unlink: this._locksUnlink };
    }
}
WatcherLocker.DIR_EVENTS = {
    add: "addDir" /* TargetEvent.ADD_DIR */,
    rename: "renameDir" /* TargetEvent.RENAME_DIR */,
    unlink: "unlinkDir" /* TargetEvent.UNLINK_DIR */
};
WatcherLocker.FILE_EVENTS = {
    add: "add" /* TargetEvent.ADD */,
    change: "change" /* TargetEvent.CHANGE */,
    rename: "rename" /* TargetEvent.RENAME */,
    unlink: "unlink" /* TargetEvent.UNLINK */
};
/* EXPORT */
exports.default = WatcherLocker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlcl9sb2NrZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvd2F0Y2hlcl9sb2NrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUNBLFlBQVk7Ozs7O0FBRVosMkNBQTJDO0FBRzNDLHNGQUE0RDtBQUc1RCxvQkFBb0I7QUFFcEIsZ0VBQWdFO0FBRWhFLE1BQU0sYUFBYTtJQXlCakIsaUJBQWlCO0lBRWpCLFlBQWMsT0FBZ0I7UUFFNUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFFeEIsSUFBSSxDQUFDLEtBQUssRUFBRyxDQUFDO0lBRWhCLENBQUM7SUFFRCxTQUFTO0lBRVQsVUFBVSxDQUFHLE1BQWtCLEVBQUUsVUFBa0IsMEJBQWM7UUFFL0QsTUFBTSxFQUFDLEdBQUcsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBQyxHQUFHLE1BQU0sQ0FBQztRQUVoRCxNQUFNLElBQUksR0FBRyxHQUFTLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUcsTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUUsQ0FBQztRQUNqRCxDQUFDLENBQUM7UUFFRixJQUFLLENBQUMsR0FBRztZQUFHLE9BQU8sSUFBSSxFQUFHLENBQUM7UUFFM0IsTUFBTSxPQUFPLEdBQUcsR0FBUyxFQUFFO1lBQ3pCLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFHLEdBQUcsQ0FBRSxDQUFDO1lBQ3pCLGdDQUFvQixDQUFDLE1BQU0sQ0FBRyxJQUFJLENBQUUsQ0FBQztRQUN2QyxDQUFDLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxHQUFTLEVBQUU7WUFDdEIsT0FBTyxFQUFHLENBQUM7WUFDWCxJQUFJLEVBQUcsQ0FBQztRQUNWLENBQUMsQ0FBQztRQUVGLGdDQUFvQixDQUFDLEdBQUcsQ0FBRyxJQUFJLEVBQUUsT0FBTyxDQUFFLENBQUM7UUFFM0MsTUFBTSxPQUFPLEdBQUcsR0FBUyxFQUFF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