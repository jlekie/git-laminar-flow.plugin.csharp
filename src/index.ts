import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as Path from 'path';
import * as FS from 'fs-extra';
import * as Zod from 'zod';
import * as Globby from 'globby'

import { Command, Option } from 'clipanion';

import { PluginHandler, BaseInteractiveCommand } from '@jlekie/git-laminar-flow-cli';

const OptionsSchema = Zod.object({
    projectPath: Zod.string().optional(),
    packageId: Zod.string().optional(),

    solutionProjects: Zod.string().array().default([])
});

const createPlugin: PluginHandler = (options) => {
    const parsedOptions = OptionsSchema.parse(options);

    return {
        updateVersion: async (oldVersion, newVersion, { config, stdout, dryRun }) => {
            if (!parsedOptions.projectPath)
                return;

            const versionRegex = new RegExp(`<Version>(.*)</Version>`);
            const projectPath = Path.resolve(config.path, parsedOptions.projectPath);

            let content = await FS.readFile(projectPath, 'utf8');
            if (versionRegex.test(content)) {
                content = content.replace(versionRegex, `<Version>${newVersion}</Version>`);

                if (!dryRun) {
                    await FS.writeFile(projectPath, content, 'utf8');
                    stdout?.write(`Updated project file written to ${projectPath}\n`);
                }
            }
            else {
                stdout?.write(`No version defined in project ${projectPath} [${oldVersion}]\n`);
            }

            if (parsedOptions.packageId && config.parentConfig) {
                for (const submodule of config.parentConfig.submodules) {
                    const matchedPlugin = submodule.config.integrations.find(i => i.plugin === '@jlekie/git-laminar-flow-plugin-csharp');
                    if (!matchedPlugin)
                        continue;

                    const matchedPluginOptions = OptionsSchema.parse(matchedPlugin.options);
                    if (!matchedPluginOptions.projectPath)
                        continue;

                    const versionRegex = new RegExp(`(<PackageReference.*Include="${parsedOptions.packageId}".*Version=")(.*)(".*>)`);
                    // const versionRegex = new RegExp(`(<PackageReference.*Include="${parsedOptions.packageId}".*Version=")(.*)(".*>)`);

                    const projectPath = Path.resolve(submodule.config.path, matchedPluginOptions.projectPath);
                    let content = await FS.readFile(projectPath, 'utf8');
                    if (versionRegex.test(content)) {
                        // console.log('MATCH FOUND: ' + projectPath);

                        content = content.replace(versionRegex, `$1${newVersion}$3`);

                        if (!dryRun) {
                            await FS.writeFile(projectPath, content, 'utf8');
                            stdout?.write(`Updated peer project file written to ${projectPath}\n`);
                        }
                    }
                }
            }
        },
        registerCommands: () => [
            class GenerateSolutionCommand extends BaseInteractiveCommand {
                static paths = [['vs', 'create', 'solution']];

                include = Option.Array('--include');
                exclude = Option.Array('--exclude');

                static usage = Command.Usage({
                    description: 'Create a new solution from repo checkouts',
                    category: "Visual Studio"
                });

                public async executeCommand() {
                    const rootConfig = await this.loadConfig();
                    const allConfigs = rootConfig.flattenConfigs();
                    const targetConfigs = await rootConfig.resolveFilteredConfigs({
                        included: this.include,
                        excluded: this.exclude
                    });

                    const solutionName = await this.createOverridablePrompt('name', value => Zod.string().nonempty().parse(value), {
                        type: 'text',
                        message: 'Solution Name'
                    });
                    const solutionPath = Path.resolve(rootConfig.path, `${solutionName}.sln`);

                    const configs = await this.createOverridablePrompt('configs', value => Zod.string().array().transform(ids => _(ids).map(id => allConfigs.find(c => c.identifier === id)).compact().value()).parse(value), (initial) => ({
                        type: 'multiselect',
                        message: 'Select Modules',
                        choices: allConfigs.map(c => ({ title: c.pathspec, value: c.identifier, selected: initial?.some(tc => tc === c.identifier) }))
                    }), {
                        defaultValue: targetConfigs.map(c => c.identifier)
                    });

                    if (await FS.pathExists(solutionPath)) {
                        this.logWarning(`Solution already exists at ${solutionPath}, cannot override`);
                        return;
                    }

                    await rootConfig.exec(`dotnet new sln -n ${solutionName}`, { stdout: this.context.stdout, dryRun: this.dryRun });

                    const matches = await Globby(parsedOptions.solutionProjects);

                    for (const match of matches) {
                        const relativePath = Path.relative(rootConfig.path, match);

                        this.logVerbose(`Adding ${match} to solution`);
                        await rootConfig.exec(`dotnet sln ${solutionName}.sln add --in-root ${relativePath}`, { stdout: this.context.stdout, dryRun: this.dryRun });
                    }
                }
            }
        ]
    }
}

export default createPlugin;
