import requests
import os
from collections import defaultdict

GITHUB_TOKEN = os.getenv("GH_TOKEN")
ORG = "frontend-knowledge-hub"

HEADERS = {
    'Authorization': f'token {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github.v3+json'
}

def get_repos():
    repos = []
    page = 1
    while True:
        url = f"https://api.github.com/orgs/{ORG}/repos?per_page=100&page={page}"
        res = requests.get(url, headers=HEADERS)
        data = res.json()
        if not data:
            break
        repos.extend(data)
        page += 1
    return [repo["full_name"] for repo in repos]

def count_contributions(repo, user):
    pr_url = f"https://api.github.com/search/issues?q=repo:{repo}+type:pr+author:{user}"
    issue_url = f"https://api.github.com/search/issues?q=repo:{repo}+type:issue+author:{user}"
    
    pr_count = requests.get(pr_url, headers=HEADERS).json().get('total_count', 0)
    issue_count = requests.get(issue_url, headers=HEADERS).json().get('total_count', 0)
    
    return pr_count, issue_count

def generate_table(user_scores):
    sorted_users = sorted(user_scores.items(), key=lambda x: x[1]["score"], reverse=True)

    lines = []
    lines.append("| Rank | Avatar | User | Commits | PRs | Issues | Score |")
    lines.append("|------|--------|------|---------|-----|--------|-------|")
    for i, (user, stats) in enumerate(sorted_users[:20], 1):
        avatar = f'<img src="https://github.com/{user}.png?size=40" width="40" height="40">'
        profile_link = f"[{user}](https://github.com/{user})"
        lines.append(f"| {i} | {avatar} | {profile_link} | {stats['commits']} | {stats['prs']} | {stats['issues']} | {stats['score']} |")
    return "\n".join(lines)

def update_readme(content):
    with open("profile/README.md", "r", encoding="utf-8") as f:
        readme = f.read()

    start_marker = "<!-- START:top-contributors -->"
    end_marker = "<!-- END:top-contributors -->"

    if start_marker in readme and end_marker in readme:
        new_section = f"{start_marker}\n{content}\n{end_marker}"
        updated_readme = (
            readme.split(start_marker)[0]
            + new_section
            + readme.split(end_marker)[1]
        )
    else:
        updated_readme = readme + f"\n\n{start_marker}\n{content}\n{end_marker}"

    with open("profile/README.md", "w", encoding="utf-8") as f:
        f.write(updated_readme)

def main():
    user_scores = defaultdict(lambda: {"commits": 0, "prs": 0, "issues": 0, "score": 0})
    repos = get_repos()

    for repo in repos:
        print(f"Processing {repo}...")
        contributors_url = f"https://api.github.com/repos/{repo}/contributors?per_page=100"
        contributors = requests.get(contributors_url, headers=HEADERS).json()
        for contributor in contributors:
            if "login" not in contributor:
                continue
            user = contributor["login"]
            commits = contributor.get("contributions", 0)
            user_scores[user]["commits"] += commits

            pr_count, issue_count = count_contributions(repo, user)
            user_scores[user]["prs"] += pr_count
            user_scores[user]["issues"] += issue_count

    for user in user_scores:
        u = user_scores[user]
        u["score"] = 5 * u["commits"] + 4 * u["prs"] + 2 * u["issues"]

    table = generate_table(user_scores)
    update_readme(table)

if __name__ == "__main__":
    main()