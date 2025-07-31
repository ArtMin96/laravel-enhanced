import * as vscode from 'vscode';

export class BladeCompletionProvider implements vscode.CompletionItemProvider {
    
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        // Check if we're typing a Blade directive
        if (beforeCursor.endsWith('@')) {
            return this.getBladeDirectiveCompletions();
        }
        
        // Check if we're inside {{ }} or {!! !!}
        if (this.isInsideEchoBlock(beforeCursor)) {
            return this.getEchoCompletions();
        }
        
        return [];
    }

    private isInsideEchoBlock(beforeCursor: string): boolean {
        const lastDoubleOpen = beforeCursor.lastIndexOf('{{');
        const lastDoubleClose = beforeCursor.lastIndexOf('}}');
        const lastTripleOpen = beforeCursor.lastIndexOf('{!!');
        const lastTripleClose = beforeCursor.lastIndexOf('!!}');
        
        // Check if we're inside {{ }}
        if (lastDoubleOpen > lastDoubleClose) {
            return true;
        }
        
        // Check if we're inside {!! !!}
        if (lastTripleOpen > lastTripleClose) {
            return true;
        }
        
        return false;
    }

    private getBladeDirectiveCompletions(): vscode.CompletionItem[] {
        const directives = [
            // Control structures
            {
                label: 'if',
                insertText: 'if($${1:condition})\n\t$0\n@endif',
                detail: 'If statement',
                documentation: 'Conditional block that executes if the condition is true'
            },
            {
                label: 'else',
                insertText: 'else\n\t$0',
                detail: 'Else statement',
                documentation: 'Alternative block for if statement'
            },
            {
                label: 'elseif',
                insertText: 'elseif($${1:condition})\n\t$0',
                detail: 'Else if statement',
                documentation: 'Additional conditional for if statement'
            },
            {
                label: 'endif',
                insertText: 'endif',
                detail: 'End if statement',
                documentation: 'Closes an if block'
            },
            {
                label: 'unless',
                insertText: 'unless($${1:condition})\n\t$0\n@endunless',
                detail: 'Unless statement',
                documentation: 'Conditional block that executes if the condition is false'
            },
            {
                label: 'endunless',
                insertText: 'endunless',
                detail: 'End unless statement',
                documentation: 'Closes an unless block'
            },
            
            // Loops
            {
                label: 'foreach',
                insertText: 'foreach($${1:items} as $${2:item})\n\t$0\n@endforeach',
                detail: 'Foreach loop',
                documentation: 'Iterate over an array or collection'
            },
            {
                label: 'endforeach',
                insertText: 'endforeach',
                detail: 'End foreach loop',
                documentation: 'Closes a foreach block'
            },
            {
                label: 'forelse',
                insertText: 'forelse($${1:items} as $${2:item})\n\t$${3:// Content}\n@empty\n\t$${4:// Empty state}\n@endforelse',
                detail: 'Forelse loop',
                documentation: 'Foreach loop with empty fallback'
            },
            {
                label: 'empty',
                insertText: 'empty\n\t$0',
                detail: 'Empty block for forelse',
                documentation: 'Fallback content when collection is empty'
            },
            {
                label: 'endforelse',
                insertText: 'endforelse',
                detail: 'End forelse loop',
                documentation: 'Closes a forelse block'
            },
            {
                label: 'for',
                insertText: 'for($${1:i} = $${2:0}; $${1:i} < $${3:count}; $${1:i}++)\n\t$0\n@endfor',
                detail: 'For loop',
                documentation: 'Traditional for loop'
            },
            {
                label: 'endfor',
                insertText: 'endfor',
                detail: 'End for loop',
                documentation: 'Closes a for block'
            },
            {
                label: 'while',
                insertText: 'while($${1:condition})\n\t$0\n@endwhile',
                detail: 'While loop',
                documentation: 'Loop while condition is true'
            },
            {
                label: 'endwhile',
                insertText: 'endwhile',
                detail: 'End while loop',
                documentation: 'Closes a while block'
            },
            
            // Layouts and sections
            {
                label: 'extends',
                insertText: 'extends(\'$${1:layouts.app}\')',
                detail: 'Extend layout',
                documentation: 'Extend a parent layout template'
            },
            {
                label: 'section',
                insertText: 'section(\'$${1:content}\')\n\t$0\n@endsection',
                detail: 'Define section',
                documentation: 'Define a section that can be yielded by parent layout'
            },
            {
                label: 'endsection',
                insertText: 'endsection',
                detail: 'End section',
                documentation: 'Closes a section block'
            },
            {
                label: 'yield',
                insertText: 'yield(\'$${1:content}\')',
                detail: 'Yield section',
                documentation: 'Display the content of a section'
            },
            {
                label: 'show',
                insertText: 'show',
                detail: 'Show section',
                documentation: 'Display section and stop extending it'
            },
            {
                label: 'stop',
                insertText: 'stop',
                detail: 'Stop section',
                documentation: 'Stop extending the current section'
            },
            {
                label: 'parent',
                insertText: 'parent',
                detail: 'Parent content',
                documentation: 'Include the parent section content'
            },
            
            // Includes and components
            {
                label: 'include',
                insertText: 'include(\'$${1:partials.header}\')',
                detail: 'Include template',
                documentation: 'Include another Blade template'
            },
            {
                label: 'includeIf',
                insertText: 'includeIf($${1:condition}, \'$${2:partials.header}\')',
                detail: 'Conditional include',
                documentation: 'Include template if condition is true'
            },
            {
                label: 'includeWhen',
                insertText: 'includeWhen($${1:condition}, \'$${2:partials.header}\')',
                detail: 'Include when condition',
                documentation: 'Include template when condition is true'
            },
            {
                label: 'includeUnless',
                insertText: 'includeUnless($${1:condition}, \'$${2:partials.header}\')',
                detail: 'Include unless condition',
                documentation: 'Include template unless condition is true'
            },
            {
                label: 'component',
                insertText: 'component(\'$${1:components.alert}\')\n\t$0\n@endcomponent',
                detail: 'Component block',
                documentation: 'Define a component with content'
            },
            {
                label: 'endcomponent',
                insertText: 'endcomponent',
                detail: 'End component',
                documentation: 'Closes a component block'
            },
            {
                label: 'slot',
                insertText: 'slot(\'$${1:title}\')\n\t$0\n@endslot',
                detail: 'Component slot',
                documentation: 'Define a slot for component content'
            },
            {
                label: 'endslot',
                insertText: 'endslot',
                detail: 'End slot',
                documentation: 'Closes a slot block'
            },
            
            // Authentication
            {
                label: 'auth',
                insertText: 'auth\n\t$0\n@endauth',
                detail: 'Authenticated users',
                documentation: 'Content visible only to authenticated users'
            },
            {
                label: 'endauth',
                insertText: 'endauth',
                detail: 'End auth block',
                documentation: 'Closes an auth block'
            },
            {
                label: 'guest',
                insertText: 'guest\n\t$0\n@endguest',
                detail: 'Guest users',
                documentation: 'Content visible only to guest users'
            },
            {
                label: 'endguest',
                insertText: 'endguest',
                detail: 'End guest block',
                documentation: 'Closes a guest block'
            },
            
            // Environment and checks
            {
                label: 'production',
                insertText: 'production\n\t$0\n@endproduction',
                detail: 'Production environment',
                documentation: 'Content visible only in production'
            },
            {
                label: 'endproduction',
                insertText: 'endproduction',
                detail: 'End production block',
                documentation: 'Closes a production block'
            },
            {
                label: 'env',
                insertText: 'env(\'$${1:local}\')\n\t$0\n@endenv',
                detail: 'Environment check',
                documentation: 'Content visible in specific environment'
            },
            {
                label: 'endenv',
                insertText: 'endenv',
                detail: 'End environment block',
                documentation: 'Closes an env block'
            },
            {
                label: 'isset',
                insertText: 'isset($${1:variable})\n\t$0\n@endisset',
                detail: 'Variable is set',
                documentation: 'Check if variable is set and not null'
            },
            {
                label: 'endisset',
                insertText: 'endisset',
                detail: 'End isset block',
                documentation: 'Closes an isset block'
            },
            
            // Stacks
            {
                label: 'push',
                insertText: 'push(\'$${1:scripts}\')\n\t$0\n@endpush',
                detail: 'Push to stack',
                documentation: 'Push content to a named stack'
            },
            {
                label: 'endpush',
                insertText: 'endpush',
                detail: 'End push block',
                documentation: 'Closes a push block'
            },
            {
                label: 'prepend',
                insertText: 'prepend(\'$${1:scripts}\')\n\t$0\n@endprepend',
                detail: 'Prepend to stack',
                documentation: 'Prepend content to a named stack'
            },
            {
                label: 'endprepend',
                insertText: 'endprepend',
                detail: 'End prepend block',
                documentation: 'Closes a prepend block'
            },
            {
                label: 'stack',
                insertText: 'stack(\'$${1:scripts}\')',
                detail: 'Display stack',
                documentation: 'Display the content of a named stack'
            },
            
            // Utilities
            {
                label: 'csrf',
                insertText: 'csrf',
                detail: 'CSRF token field',
                documentation: 'Generate a hidden CSRF token field'
            },
            {
                label: 'method',
                insertText: 'method(\'$${1:PUT}\')',
                detail: 'HTTP method field',
                documentation: 'Generate a hidden HTTP method field'
            },
            {
                label: 'json',
                insertText: 'json($${1:data})',
                detail: 'JSON encode',
                documentation: 'Convert PHP data to JSON'
            },
            {
                label: 'dump',
                insertText: 'dump($${1:variable})',
                detail: 'Dump variable',
                documentation: 'Dump variable for debugging'
            },
            {
                label: 'dd',
                insertText: 'dd($${1:variable})',
                detail: 'Dump and die',
                documentation: 'Dump variable and stop execution'
            },
            
            // Translations
            {
                label: 'lang',
                insertText: 'lang(\'$${1:messages.welcome}\')',
                detail: 'Language translation',
                documentation: 'Get translation for the given key'
            },
            {
                label: 'choice',
                insertText: 'choice(\'$${1:messages.items}\', $${2:count})',
                detail: 'Pluralization',
                documentation: 'Get translation with pluralization'
            },
            
            // PHP blocks
            {
                label: 'php',
                insertText: 'php\n\t$0\n@endphp',
                detail: 'PHP code block',
                documentation: 'Execute PHP code within template'
            },
            {
                label: 'endphp',
                insertText: 'endphp',
                detail: 'End PHP block',
                documentation: 'Closes a PHP block'
            }
        ];

        return directives.map(directive => {
            const item = new vscode.CompletionItem(directive.label, vscode.CompletionItemKind.Keyword);
            item.insertText = new vscode.SnippetString(directive.insertText);
            item.detail = directive.detail;
            item.documentation = directive.documentation;
            item.sortText = directive.label;
            return item;
        });
    }

    private getEchoCompletions(): vscode.CompletionItem[] {
        const completions = [
            {
                label: '$loop',
                insertText: 'loop',
                detail: 'Loop variable',
                documentation: 'Access loop information in foreach/forelse loops'
            },
            {
                label: '$loop->first',
                insertText: 'loop->first',
                detail: 'First iteration',
                documentation: 'True if this is the first iteration'
            },
            {
                label: '$loop->last',
                insertText: 'loop->last',
                detail: 'Last iteration',
                documentation: 'True if this is the last iteration'
            },
            {
                label: '$loop->index',
                insertText: 'loop->index',
                detail: 'Current index (0-based)',
                documentation: 'The index of the current loop iteration (starts at 0)'
            },
            {
                label: '$loop->iteration',
                insertText: 'loop->iteration',
                detail: 'Current iteration (1-based)',
                documentation: 'The current loop iteration (starts at 1)'
            },
            {
                label: '$loop->count',
                insertText: 'loop->count',
                detail: 'Total iterations',
                documentation: 'The total number of items in the loop'
            },
            {
                label: '$loop->remaining',
                insertText: 'loop->remaining',
                detail: 'Remaining iterations',
                documentation: 'The iterations remaining in the loop'
            },
            {
                label: '$loop->depth',
                insertText: 'loop->depth',
                detail: 'Loop nesting level',
                documentation: 'The nesting level of the current loop'
            },
            {
                label: '$loop->parent',
                insertText: 'loop->parent',
                detail: 'Parent loop',
                documentation: 'Access the parent loop variable when in nested loops'
            },
            {
                label: '$errors',
                insertText: 'errors',
                detail: 'Validation errors',
                documentation: 'Access validation error messages'
            },
            {
                label: '$errors->has()',
                insertText: 'errors->has(\'${1:field}\')',
                detail: 'Check for field error',
                documentation: 'Check if a specific field has validation errors'
            },
            {
                label: '$errors->first()',
                insertText: 'errors->first(\'${1:field}\')',
                detail: 'First error message',
                documentation: 'Get the first error message for a field'
            },
            {
                label: 'old()',
                insertText: 'old(\'${1:field}\')',
                detail: 'Old input value',
                documentation: 'Retrieve old input value'
            },
            {
                label: 'asset()',
                insertText: 'asset(\'${1:path}\')',
                detail: 'Asset URL',
                documentation: 'Generate URL for asset'
            },
            {
                label: 'url()',
                insertText: 'url(\'${1:path}\')',
                detail: 'Generate URL',
                documentation: 'Generate a URL for the given path'
            },
            {
                label: 'route()',
                insertText: 'route(\'${1:name}\')',
                detail: 'Named route URL',
                documentation: 'Generate URL for named route'
            },
            {
                label: 'auth()->user()',
                insertText: 'auth()->user()',
                detail: 'Current user',
                documentation: 'Get the currently authenticated user'
            },
            {
                label: 'config()',
                insertText: 'config(\'${1:key}\')',
                detail: 'Configuration value',
                documentation: 'Get configuration value'
            }
        ];

        return completions.map(completion => {
            const item = new vscode.CompletionItem(completion.label, vscode.CompletionItemKind.Variable);
            item.insertText = new vscode.SnippetString(completion.insertText);
            item.detail = completion.detail;
            item.documentation = completion.documentation;
            return item;
        });
    }
}