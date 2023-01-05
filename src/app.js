import readlineSync from 'readline-sync';
import chalk from 'chalk';
import childProcess from 'node:child_process';
import fs from 'fs-extra';
import { Octokit } from "@octokit/rest";
import libsodium from "libsodium-wrappers";

try
{
    childProcess.execSync(`git --version`, { stdio: `ignore` });
}
catch
{
    console.log(chalk.red(`Git is not installed (or not in path). Please install git and try again.`));
    process.exit(1);
}

const ghPat = readlineSync.question(`What is your GitHub Personal Access Token?: `, {
    hideEchoBack: true,
});
const ghUsername = readlineSync.question(`What Username/Organization do you want to use?: `);
const ghRepoName = readlineSync.question(`What is the name of the repo?: `);
const ghRepoDescription = readlineSync.question(`What is the description of the repo?: `);
const ghRepoPrivate = readlineSync.keyInYN(`Is this a private repo?: `);
const ghRepoDisableProjects = readlineSync.keyInYN(`Disable Projects and Wikis?: `);
const ghRepoDisableIssues = readlineSync.keyInYN(`Disable Issues?: `);
const ghRepoNodejs = readlineSync.keyInYN(`Is this a nodejs project (or will this project ever require JS linting)?: `);
const diskPath = readlineSync.questionPath(`Where are we saving this repo on disk?: (i.e. ~/Documents/${ ghRepoName }) `, {
    isDirectory: true,
    exists: undefined,
    create: true
});

fs.copySync(`./src/template/`, diskPath);
fs.renameSync(`${ diskPath }/.editorconfig.template`, `${ diskPath }/.editorconfig`);

const octokit = new Octokit({
    auth: ghPat,
});

let ghUserType;
try
{
    await octokit.users.getByUsername({
        username: ghUsername
    });
    ghUserType = `user`;
}
catch
{
    ghUserType = `org`;
}

let readmeFile = fs.readFileSync(`${ diskPath }/README.md`, `utf8`);
readmeFile = readmeFile.replaceAll(`{{projectName}}`, ghRepoName);
readmeFile = readmeFile.replaceAll(`{{userName}}`, ghUsername);
readmeFile = readmeFile.replaceAll(`{{projectDescription}}`, ghRepoDescription);
fs.writeFileSync(`${ diskPath }/README.md`, readmeFile, `utf8`);

let licenseFile = fs.readFileSync(`${ diskPath }/LICENSE.md`, `utf8`);
licenseFile = licenseFile.replaceAll(`{{YEAR}}`, new Date().getFullYear());
licenseFile = licenseFile.replaceAll(`{{AUTHOR}}`, ghUsername);
fs.writeFileSync(`${ diskPath }/LICENSE.md`, licenseFile, `utf8`);

if (ghRepoNodejs)
{
    fs.unlinkSync(`${ diskPath }/.github/workflows/linter.nojs`);
    let packageJson = fs.readFileSync(`${ diskPath }/package.json`, `utf8`);
    packageJson = packageJson.replaceAll(`{{AUTHOR}}`, ghUsername);
    packageJson = packageJson.replaceAll(`{{REPO}}`, ghRepoName);
    packageJson = packageJson.replaceAll(`project-name`, ghRepoName);
    packageJson = packageJson.replaceAll(`project-description`, ghRepoDescription);
    fs.writeFileSync(`${ diskPath }/package.json`, packageJson, `utf8`);
    childProcess.execSync(`npx npm-check-updates -u && npm i`, {
        cwd: `${ diskPath }`, stdio: `inherit`, stdout: `ignore`, stderr: `ignore`
    });
}
else
{
    fs.unlinkSync(`${ diskPath }/package.json`);
    fs.unlinkSync(`${ diskPath }/.eslintrc.json`);
    fs.unlinkSync(`${ diskPath }/src/app.js`);
    fs.unlinkSync(`${ diskPath }/.github/workflows/auto-merge.yml`);
    fs.unlinkSync(`${ diskPath }/.github/workflows/linter.yml`);
    fs.renameSync(`${ diskPath }/.github/workflows/linter.nojs`, `${ diskPath }/.github/workflows/linter.yml`);
}

if (ghRepoPrivate)
{
    let readmeFile = fs.readFileSync(`${ diskPath }/README.md`, `utf8`);
    readmeFile = readmeFile.replaceAll(`img.shields.io`, `badges.chse.dev:`);
    fs.writeFileSync(`${ diskPath }/README.md`, readmeFile, `utf8`);
}

const repoOptions = {
    name: ghRepoName,
    description: ghRepoDescription,
    private: ghRepoPrivate,
    /* eslint-disable camelcase */
    has_issues: !ghRepoDisableIssues,
    has_projects: !ghRepoDisableProjects,
    has_wiki: !ghRepoDisableProjects,
    /* eslint-enable camelcase */
};

await (ghUserType === `user` ? octokit.repos.createForAuthenticatedUser({ ...repoOptions }) : octokit.repos.createInOrg({
    org: ghUsername,
    ...repoOptions
}));

await libsodium.ready;

let key = await octokit.request(`GET /repos/{owner}/{repo}/actions/secrets/public-key`, {
    owner: ghUsername,
    repo: ghRepoName
});
const keyId = key.data.key_id;
key = key.data.key;

const encryptedValue = Buffer.from(libsodium.crypto_box_seal(Buffer.from(ghPat), Buffer.from(key, `base64`))).toString(`base64`);

await octokit.actions.createOrUpdateRepoSecret({
    owner: ghUsername,
    repo: ghRepoName,
    /* eslint-disable camelcase */
    secret_name: `GH_PAT`,
    encrypted_value: encryptedValue,
    key_id: keyId
    /* eslint-enable camelcase */
});

childProcess.execSync(`git init && git add . && git commit -m "Initial Commit" && git branch -M main && git remote add origin https://github.com/${ ghUsername }/${ ghRepoName }.git && git push -u origin main`, {
    cwd: `${ diskPath }`, stdio: `inherit`, stdout: `ignore`, stderr: `ignore`
});
console.log(chalk.green(`Done! Your repo is ready at:\nhttps://github.com/${ ghUsername }/${ ghRepoName }`));
