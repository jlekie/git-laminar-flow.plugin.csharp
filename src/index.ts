import * as Path from 'path';
import * as FS from 'fs-extra';
import * as Zod from 'zod';

import { PluginHandler } from '@jlekie/git-laminar-flow-cli';

const OptionsSchema = Zod.object({
    projectPath: Zod.string()
});

const createPlugin: PluginHandler = (options) => {
    const parsedOptions = OptionsSchema.parse(options);

    return {
        updateVersion: async (oldVersion, newVersion, { config, stdout, dryRun }) => {
            const versionRegex = new RegExp(`<Version>${oldVersion ?? '(.*)'}</Version>`);
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
        }
    }
}

export default createPlugin;
