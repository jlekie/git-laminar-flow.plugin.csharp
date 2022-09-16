import * as Path from 'path';
import * as FS from 'fs-extra';
import * as Zod from 'zod';

import { PluginHandler } from '@jlekie/git-laminar-flow-cli';

const OptionsSchema = Zod.object({
    projectPath: Zod.string(),
    packageId: Zod.string().optional()
});

const createPlugin: PluginHandler = (options) => {
    const parsedOptions = OptionsSchema.parse(options);

    return {
        updateVersion: async (oldVersion, newVersion, { config, stdout, dryRun }) => {
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
        }
    }
}

export default createPlugin;
