"use strict";
/* IMPORT */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = __importDefault(require("./utils"));
const watcher_stats_1 = __importDefault(require("./watcher_stats"));
/* WATCHER POLLER */
class WatcherPoller {
    constructor() {
        /* VARIABLES */
        this.inos = {};
        this.stats = new Map();
    }
    /* API */
    getIno(targetPath, event, type) {
        const inos = this.inos[event];
        if (!inos)
            return;
        const ino = inos[targetPath];
        if (!ino)
            return;
        if (type && ino[1] !== type)
            return;
        return ino[0];
    }
    getStats(targetPath) {
        return this.stats.get(targetPath);
    }
    async poll(targetPath, timeout) {
        const stats = await utils_1.default.fs.poll(targetPath, timeout);
        if (!stats)
            return;
        const isSupported = stats.isFile() || stats.isDirectory();
        if (!isSupported)
            return;
        return new watcher_stats_1.default(stats);
    }
    reset() {
        this.inos = {};
        this.stats = new Map();
    }
    async update(targetPath, timeout) {
        const prev = this.getStats(targetPath), next = await this.poll(targetPath, timeout);
        this.updateStats(targetPath, next);
        if (!prev && next) {
            if (next.isFile()) {
                this.updateIno(targetPath, "add" /* TargetEvent.ADD */, next);
                return ["add" /* TargetEvent.ADD */];
            }
            if (next.isDirectory()) {
                this.updateIno(targetPath, "addDir" /* TargetEvent.ADD_DIR */, next);
                return ["addDir" /* TargetEvent.ADD_DIR */];
            }
        }
        else if (prev && !next) {
            if (prev.isFile()) {
                this.updateIno(targetPath, "unlink" /* TargetEvent.UNLINK */, prev);
                return ["unlink" /* TargetEvent.UNLINK */];
            }
            if (prev.isDirectory()) {
                this.updateIno(targetPath, "unlinkDir" /* TargetEvent.UNLINK_DIR */, prev);
                return ["unlinkDir" /* TargetEvent.UNLINK_DIR */];
            }
        }
        else if (prev && next) {
            if (prev.isFile()) {
                if (next.isFile()) {
                    if (prev.ino === next.ino && !prev.size && !next.size)
                        return []; // Same path, same content and same file, nothing actually changed
                    this.updateIno(targetPath, "change" /* TargetEvent.CHANGE */, next);
                    return ["change" /* TargetEvent.CHANGE */];
                }
                if (next.isDirectory()) {
                    this.updateIno(targetPath, "unlink" /* TargetEvent.UNLINK */, prev);
                    this.updateIno(targetPath, "addDir" /* TargetEvent.ADD_DIR */, next);
                    return ["unlink" /* TargetEvent.UNLINK */, "addDir" /* TargetEvent.ADD_DIR */];
                }
            }
            else if (prev.isDirectory()) {
                if (next.isFile()) {
                    this.updateIno(targetPath, "unlinkDir" /* TargetEvent.UNLINK_DIR */, prev);
                    this.updateIno(targetPath, "add" /* TargetEvent.ADD */, next);
                    return ["unlinkDir" /* TargetEvent.UNLINK_DIR */, "add" /* TargetEvent.ADD */];
                }
                if (next.isDirectory()) {
                    if (prev.ino === next.ino)
                        return []; // Same path and same directory, nothing actually changed
                    this.updateIno(targetPath, "unlinkDir" /* TargetEvent.UNLINK_DIR */, prev);
                    this.updateIno(targetPath, "addDir" /* TargetEvent.ADD_DIR */, next);
                    return ["unlinkDir" /* TargetEvent.UNLINK_DIR */, "addDir" /* TargetEvent.ADD_DIR */];
                }
            }
        }
        return [];
    }
    updateIno(targetPath, event, stats) {
        const inos = this.inos[event] = this.inos[event] || (this.inos[event] = {}), type = stats.isFile() ? 2 /* FileType.FILE */ : 1 /* FileType.DIR */;
        inos[targetPath] = [stats.ino, type];
    }
    updateStats(targetPath, stats) {
        if (stats) {
            this.stats.set(targetPath, stats);
        }
        else {
            this.stats.delete(targetPath);
        }
    }
}
/* EXPORT */
exports.default = WatcherPoller;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hlcl9wb2xsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvd2F0Y2hlcl9wb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUNBLFlBQVk7Ozs7O0FBR1osb0RBQTRCO0FBQzVCLG9FQUEyQztBQUczQyxvQkFBb0I7QUFFcEIsTUFBTSxhQUFhO0lBQW5CO1FBRUUsZUFBZTtRQUVmLFNBQUksR0FBZ0UsRUFBRSxDQUFDO1FBQ3ZFLFVBQUssR0FBNEIsSUFBSSxHQUFHLEVBQUcsQ0FBQztJQXNLOUMsQ0FBQztJQXBLQyxTQUFTO0lBRVQsTUFBTSxDQUFHLFVBQWdCLEVBQUUsS0FBa0IsRUFBRSxJQUFlO1FBRTVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUIsSUFBSyxDQUFDLElBQUk7WUFBRyxPQUFPO1FBRXBCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUU3QixJQUFLLENBQUMsR0FBRztZQUFHLE9BQU87UUFFbkIsSUFBSyxJQUFJLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUk7WUFBRyxPQUFPO1FBRXRDLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWhCLENBQUM7SUFFRCxRQUFRLENBQUcsVUFBZ0I7UUFFekIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBRyxVQUFVLENBQUUsQ0FBQztJQUV2QyxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBRyxVQUFnQixFQUFFLE9BQWdCO1FBRTdDLE1BQU0sS0FBSyxHQUFHLE1BQU0sZUFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUcsVUFBVSxFQUFFLE9BQU8sQ0FBRSxDQUFDO1FBRTFELElBQUssQ0FBQyxLQUFLO1lBQUcsT0FBTztRQUVyQixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFHLElBQUksS0FBSyxDQUFD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