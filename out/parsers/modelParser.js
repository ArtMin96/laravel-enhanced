"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelParser = void 0;
const fs = require("fs");
class ModelParser {
    static parseModel(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const relationships = [];
        // Parse relationships
        const relationshipMethods = [
            'hasOne', 'hasMany', 'belongsTo', 'belongsToMany',
            'hasOneThrough', 'hasManyThrough', 'morphTo',
            'morphOne', 'morphMany', 'morphToMany'
        ];
        relationshipMethods.forEach(method => {
            const regex = new RegExp(`public\\s+function\\s+(\\w+)\\s*\\(.*?\\)\\s*{[^}]*${method}\\s*\\(\\s*([^,)]+)`, 'g');
            let match;
            while ((match = regex.exec(content)) !== null) {
                relationships.push({
                    name: match[1],
                    type: method,
                    model: match[2].replace(/['"`]/g, '').replace(/::class/, '')
                });
            }
        });
        return {
            relationships,
            filePath
        };
    }
}
exports.ModelParser = ModelParser;
//# sourceMappingURL=modelParser.js.map