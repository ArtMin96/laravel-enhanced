import * as vscode from 'vscode';
import * as fs from 'fs';

export class ModelParser {
    static parseModel(filePath: string): ModelInfo {
        const content = fs.readFileSync(filePath, 'utf8');
        const relationships: Relationship[] = [];
        
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

interface ModelInfo {
    relationships: Relationship[];
    filePath: string;
}

interface Relationship {
    name: string;
    type: string;
    model: string;
}