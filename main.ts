import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Plugin,
	PluginSettingTab,
	Setting,
	getAllTags,
	TFile,
	MetadataCache,
	DataAdapter,
	TAbstractFile,
} from "obsidian";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";

function parseTag(tag: string, tagList: string[]) {
	tag = tag.trim();

	// Skip empty tags
	if (tag.length === 0) {
		return;
	}

	// Parse all subtags out of the given tag.
	// I.e., #hello/i/am would yield [#hello/i/am, #hello/i, #hello]. */
	tagList.push(tag);
	while (tag.contains("/")) {
		tag = tag.substring(0, tag.lastIndexOf("/"));
		tagList.push(tag);
	}
}

type FilterMDFilesType = {
	file: TFile;
	tagListInclude: string[];
	tagListExclude: string[];
	metadataCache: MetadataCache;
};

function FilterMDFiles({
	file,
	tagListInclude,
	tagListExclude,
	metadataCache,
}: FilterMDFilesType) {
	const tags = getAllTags(metadataCache.getFileCache(file)).map((e) =>
		e.slice(1, e.length)
	);
	const allLinks = metadataCache.resolvedLinks;
	console.log(allLinks);
	if (tags && tags.length > 0) {
		const filetags: string[] = [];
		tags.forEach((tag) => parseTag(tag, filetags));
		let resultFiles: TAbstractFile[] = [];
		//tagListInclude.every((val) => {
		//	return filetags.indexOf(val as string) >= 0;
		//});
		for (const tag in tagListInclude) {
			if (filetags.indexOf(tagListInclude[tag] as string) >= 0) {
				resultFiles.push(file);
			}
		}
		let resources: string[] = [];
		for (const file in resultFiles) {
			const resource = allLinks[resultFiles[file].path];
			for (const resourceName in resource) {
				resources.push(resourceName);
			}
		}
		for (const i in resources) {
			resultFiles.push(file.vault.getAbstractFileByPath(resources[i]));
		}
		return resultFiles;
	}
}

function copyFiles({
	files,
	exportFolder,
}: {
	files: TAbstractFile[];
	exportFolder: string;
}) {
	files.forEach((file) => {
		const basePath = file.vault.adapter.basePath;
		const srcFile = path.join(basePath, file.path);
		const dstFile = path.join(basePath, exportFolder, file.path);
		console.log("copy from:" + srcFile + " \ncopy to:" + dstFile);
		fse.copySync(srcFile, dstFile, { overwrite: true });
	});
	return;
}

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"dice",
			"Vault Eporter",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				// new Notice('This is a notice!');
				new ExportModal(this.app).open();
			}
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-sample-modal-simple",
			name: "Open sample modal (simple)",
			callback: () => {
				new SampleModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Sample Editor Command");
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ExportModal extends Modal {
	tagInclude: string;
	tagExclude: string;
	exportFolder = "./export/";
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.empty();
		contentEl.createEl("h2", { text: "Export Vault notes" });

		new Setting(contentEl)
			.setName("Query to export")
			.addText((text) =>
				text.setPlaceholder("Enter +tags").onChange(async (value) => {
					this.tagInclude = value;
				})
			)
			.addText((text) =>
				text.setPlaceholder("Enter -tags").onChange(async (value) => {
					this.tagExclude = value;
				})
			)
			.addButton((button) =>
				button.setButtonText("Export").onClick(async (_event) => {
					const vaultFiles = this.app.vault.getMarkdownFiles();
					const fileCache = this.app.metadataCache;
					const tagListInclude: string[] = [this.tagInclude];
					const tagListExclude: string[] = [this.tagExclude];
					let fileList: TAbstractFile[] = [];
					for (let i = 0; i < vaultFiles.length; i++) {
						const file = FilterMDFiles({
							file: vaultFiles[i],
							tagListExclude,
							tagListInclude,
							metadataCache: fileCache,
						});
						if (file !== undefined && file.length > 0)
							file.forEach((element) => {
								fileList.push(element);
							});
					}
					//const fileList = vaultFiles.filter((file) =>
					//	FilterMDFiles({
					//		file: file,
					//		tagListExclude,
					//		tagListInclude,
					//		metadataCache: fileCache,
					//	})
					//);
					console.log("fileList =" + fileList);
					if (!fileList) {
						return;
					}
					copyFiles({
						files: fileList,
						exportFolder: this.exportFolder,
					});
				})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Settings for my awesome plugin." });

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						console.log("Secret: " + value);
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
