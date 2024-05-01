import { App, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { ulid } from "ulid";

interface IDPluginSettings {
    ignoreFileRegex: string;
    idKey: string;
}

const DEFAULT_SETTINGS: Partial<IDPluginSettings> = {
    ignoreFileRegex: "",
    idKey: "id",
};

function addID(app: App, settings: IDPluginSettings): (f: TFile) => Promise<void> {
    return async function (f: TFile): Promise<void> {
        // Check if the file should be ignored
        const ignoredPaths = settings.ignoreFileRegex.split("\n");
        if (ignoredPaths.some((pattern) => new RegExp(pattern).test(f.path))) {
            return;
        }
        const key = settings.idKey;
        if (!app.metadataCache.getFileCache(f)?.frontmatter?.[key]) {
            await app.fileManager.processFrontMatter(f, (data) => {
                data[key] = ulid();
            });
        }
    };
}

function addIDsToAllNotes(app: App, settings: IDPluginSettings) {
    const _addID = addID(app, settings);
    return function () {
        app.vault.getMarkdownFiles().forEach((f) => _addID(f));
    };
}

function updateAllIDs(app: App, oldKey: string, newKey: string) {
    if (oldKey === newKey) {
        return;
    }
    
    app.vault.getMarkdownFiles().forEach((f) => {
        if (app.metadataCache.getFileCache(f)?.frontmatter?.[oldKey]) {
            app.fileManager.processFrontMatter(f, (data) => {
                data[newKey] = data[oldKey];
                delete data[oldKey];
            });
        }
    });
}

export default class IDPlugin extends Plugin {
    settings: IDPluginSettings;
    async onload() {
        // Load the settings
        await this.loadSettings();

        // Called when a file has been indexed, and its (updated) cache is now
        // available.
        this.registerEvent(
            this.app.metadataCache.on("changed", addID(this.app, this.settings))
        );

        this.addCommand({
            id: "add-ids-to-all-notes",
            name: "Add an ID to all notes",
            callback: addIDsToAllNotes(this.app, this.settings),
        });

        // Add a settings tab
        this.addSettingTab(new IDPluginSettingTab(this.app, this));
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}


export class IDPluginSettingTab extends PluginSettingTab {
    plugin: IDPlugin;
    constructor(app: App, plugin: IDPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Add an ID to front matter' });

        // Special thanks to tygrosin
        // https://github.com/tgrosinger/recent-files-obsidian/
        const fragment = document.createDocumentFragment();
        const link = document.createElement('a');
        link.href =
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
        link.text = 'MDN - Regular expressions';
        fragment.append('RegExp patterns to ignore. One pattern per line.');
        fragment.append(document.createElement('br'));
        fragment.append('See ');
        fragment.append(link);
        fragment.append(' for help.');
        new Setting(containerEl)
        .setName("Front matter key")
        .setDesc("Name of the front matter key to use for the ID.")
        .addText((text) =>{
          text
            .setPlaceholder("front matter key name")
            .setValue(this.plugin.settings.idKey);
            text.inputEl.onblur = async (e: FocusEvent) => {
                const val = (e.target as HTMLInputElement).value;
                updateAllIDs(this.app, this.plugin.settings.idKey, val);
                this.plugin.settings.idKey = val;
                this.plugin.saveSettings();
            };
        });

        new Setting(containerEl)
        .setName('RegExp of files to ignore')
        .setDesc(fragment)
        .addTextArea((textArea: any) => {
          textArea.inputEl.setAttr('rows', 6);
          textArea.inputEl.setAttr('cols', 40);
          textArea
            .setPlaceholder('^templates/ - files in \'templates/\'\n\\.png$ - files ending with \'.png\'\nfoobar.*baz')
            .setValue(this.plugin.settings.ignoreFileRegex);
          textArea.inputEl.onblur = async (e: FocusEvent) => {
            const patternStr = (e.target as HTMLInputElement).value;
            this.plugin.settings.ignoreFileRegex = patternStr;
            await this.plugin.saveSettings();
          };
        });
    }
}
