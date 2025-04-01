const fs = require("fs");
require("dotenv").config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG;

if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN is not defined in the environment variables.");
}

if (!GITHUB_ORG) {
  throw new Error("GITHUB_ORG is not defined in the environment variables.");
}

async function onFetch(url) {
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
  };

  let retries = 3;
  while (retries > 0) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;

    if (res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0") {
      const resetTime = res.headers.get("X-RateLimit-Reset");
      const waitTime = resetTime ? resetTime * 1000 - Date.now() : 60000;
      console.log(`Rate limit exceeded. Retrying in ${waitTime / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    } else {
      retries--;
      if (retries === 0) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      }
    }
  }
}

async function getRepos() {
  let repos = [];
  let page = 1;

  while (true) {
    const res = await onFetch(`https://api.github.com/orgs/${GITHUB_ORG}/repos?per_page=100&page=${page}`);
    const data = await res.json();

    if (!data.length) break;

    repos = repos.concat(data);
    page++;
  }

  return repos.map((repo) => repo.full_name);
}

async function countContributions(repo, user) {
  const prRes = await onFetch(`https://api.github.com/search/issues?q=repo:${repo}+type:pr+author:${user}`);
  const prData = await prRes.json();

  const issueRes = await onFetch(`https://api.github.com/search/issues?q=repo:${repo}+type:issue+author:${user}`);
  const issueData = await issueRes.json();

  return [prData.total_count || 0, issueData.total_count || 0];
}

function generateTable(userScores) {
  const sortedUsers = Object.entries(userScores).sort((a, b) => b[1].score - a[1].score);
  const lines = [];

  lines.push("| Rank | Avatar | User | Commits | PRs | Issues | Score |");
  lines.push("|------|--------|------|---------|-----|--------|-------|");

  sortedUsers.slice(0, 20).forEach(([user, stats], i) => {
    const avatar = `<img src="https://github.com/${user}.png?size=40" width="40" height="40">`;
    const profileLink = `[${user}](https://github.com/${user})`;
    lines.push(`| ${i + 1} | ${avatar} | ${profileLink} | ${stats.commits} | ${stats.prs} | ${stats.issues} | ${stats.score} |`);
  });

  return lines.join("\n");
}

function updateReadme(content) {
  const readmePath = "profile/README.md";
  let readme = fs.readFileSync(readmePath, "utf-8");

  const startMarker = "<!-- START:top-contributors -->";
  const endMarker = "<!-- END:top-contributors -->";

  if (readme.includes(startMarker) && readme.includes(endMarker)) {
    const before = readme.split(startMarker)[0];
    const after = readme.split(endMarker)[1];
    readme = `${before}${startMarker}\n${content}\n${endMarker}${after}`;
  } else {
    readme += `\n\n${startMarker}\n${content}\n${endMarker}`;
  }

  fs.writeFileSync(readmePath, readme, "utf-8");
}

async function main() {
  const userScores = {};
  const repos = await getRepos();

  await Promise.all(
    repos.map(async (repo) => {
      console.log(`Processing ${repo}...`);
      const res = await onFetch(`https://api.github.com/repos/${repo}/contributors?per_page=100`);
      const contributors = await res.json();

      await Promise.all(
        contributors.map(async (contributor) => {
          if (!contributor.login) return;

          const user = contributor.login;
          const commits = contributor.contributions || 0;

          if (!userScores[user]) {
            userScores[user] = { commits: 0, prs: 0, issues: 0, score: 0 };
          }

          userScores[user].commits += commits;

          const [prCount, issueCount] = await countContributions(repo, user);
          userScores[user].prs += prCount;
          userScores[user].issues += issueCount;
        })
      );
    })
  );

  for (const user in userScores) {
    const u = userScores[user];
    u.score = 5 * u.commits + 4 * u.prs + 2 * u.issues;
  }

  const table = generateTable(userScores);
  updateReadme(table);
}

main().catch((err) => console.error(err));