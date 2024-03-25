import { getInput, info, setFailed, setOutput } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { getDiff } from "graphql-schema-diff";
import { join } from "path";


const header = getInput("header");

function resolveHome(filepath) {
    if (filepath != null && filepath !== '' && filepath[0] === '~') {
        return join(process.env.HOME, filepath.slice(1));
    }
    return filepath;
}

const oldSchema = resolveHome(getInput("old-schema"));
const newSchema = resolveHome(getInput("new-schema"));
const outputPath = resolveHome(getInput("output-path"));

getDiff(oldSchema, newSchema).then(async result => {
    const {repo:{owner, repo}, payload: {pull_request: {number}}} = context;
    const kit = getOctokit(getInput("token"));

    const {data: comments} = await kit.rest.issues.listComments({
        owner,
        repo,
        issue_number: number
    });
    
    info(JSON.stringify(comments, null, 2))

    const existing = comments.find(comment => comment.body.startsWith(header));
    
    if (result) {
        const breaking = result.breakingChanges.length === 0 ? "" : `
### 🚨 Breaking Changes 
${result.breakingChanges.map(x => " - " + x.description).join("\n")}
        `

        const dangerous = result.dangerousChanges.length === 0 ? "" : `
### ⚠️ Dangerous Changes
${result.dangerousChanges.map(x => " - " + x.description).join("\n")}
        `

        const body = `${header}

<details>
<summary>
View schema changes
</summary>

\`\`\`diff
${result.diffNoColor.split("\n").slice(2).join("\n")}
\`\`\`
</details>

${breaking}
${dangerous}
        `
        setOutput("diff_output", body);

        if (existing) {
            await kit.rest.issues.updateComment({
                owner,
                repo,
                comment_id: existing.id,
                body,
            });
            
        } else {
            await kit.rest.issues.createComment({
                owner,
                repo,
                issue_number: number,
                body,
            });
        }

    } else {
        info("No schema changes.");
        
        if (existing) {
            await kit.rest.issues.deleteComment({
                owner,
                repo,
                comment_id: existing.id
            });
            
            
            info("Deleted comment.")
        }
    }
}).catch((err) => {
 setFailed(err.stack)
 setFailed(err)
});
    