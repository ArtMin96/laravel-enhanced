"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteProvider = void 0;
const fs = require("fs");
const path = require("path");
class RouteProvider {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.routes = new Map();
        this.parseRoutes();
    }
    parseRoutes() {
        const routesPath = path.join(this.workspaceRoot, 'routes');
        if (!fs.existsSync(routesPath))
            return;
        const routeFiles = ['web.php', 'api.php'];
        routeFiles.forEach(file => {
            const filePath = path.join(routesPath, file);
            if (fs.existsSync(filePath)) {
                this.parseRouteFile(filePath);
            }
        });
    }
    parseRouteFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        // Simple regex to match route definitions
        const routeRegex = /Route::(get|post|put|patch|delete|any|match|resource)\s*\(\s*['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = routeRegex.exec(content)) !== null) {
            const [, method, uri] = match;
            this.routes.set(uri, {
                method,
                uri,
                filePath,
                line: content.substring(0, match.index).split('\n').length
            });
        }
    }
    getRoutes() {
        return Array.from(this.routes.values());
    }
}
exports.RouteProvider = RouteProvider;
//# sourceMappingURL=routeProvider.js.map