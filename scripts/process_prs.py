import subprocess
import json
import time
import sys
import os
from datetime import datetime, timezone, timedelta

# Default repository for this workspace (can also be overridden via REPO env var or argument)
REPO = os.getenv("GITHUB_REPOSITORY", "Farm-credit/stellar-app-os")
MERGE_COMMENT = "Thanks for the work. Kindly ensure you offramp with Fundable at [https://stellar.fundable.finance/offramp](https://stellar.fundable.finance/offramp)"
CONFLICT_COMMENT = "Please fix up the merge conflict and update your PR. Kindly ensure you offramp with Fundable at [https://stellar.fundable.finance/offramp](https://stellar.fundable.finance/offramp)"
CLOSE_COMMENT = "Closing this PR as it is older than a month. Kindly ensure you offramp with Fundable at [https://stellar.fundable.finance/offramp](https://stellar.fundable.finance/offramp)"

# Ensure standard tool paths are in PATH
for path_dir in ["/usr/local/bin", "/opt/homebrew/bin", os.path.expanduser("~/.local/bin")]:
    if path_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{path_dir}:{os.environ.get('PATH', '')}"

def run_cmd(cmd):
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode, res.stdout.strip(), res.stderr.strip()

def get_pr(pr_num):
    # Retry and poll to allow GitHub backend to calculate mergeability
    for attempt in range(10):
        code, out, err = run_cmd(["gh", "api", f"repos/{REPO}/pulls/{pr_num}"])
        if code == 0:
            data = json.loads(out)
            mergeable = data.get("mergeable")
            mergeable_state = data.get("mergeable_state")
            if mergeable is not None and mergeable_state not in ("unknown", None):
                return data
            time.sleep(2)
        else:
            time.sleep(2)
    return json.loads(out) if code == 0 else None

def get_pr_review_info(pr_num):
    code, out, err = run_cmd(["gh", "pr", "view", str(pr_num), "--repo", REPO, "--json", "reviewDecision,reviews"])
    if code == 0:
        return json.loads(out)
    return {}

def has_changes_requested(pr_num):
    info = get_pr_review_info(pr_num)
    if info.get("reviewDecision") == "CHANGES_REQUESTED":
        return True
    reviews = info.get("reviews", [])
    for r in reviews:
        if r.get("state") == "CHANGES_REQUESTED":
            return True
    return False

def is_older_than_a_month(created_at_str):
    try:
        dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - dt) >= timedelta(days=30)
    except Exception as e:
        print(f"Error parsing date {created_at_str}: {e}", file=sys.stderr)
        return False

def get_all_open_prs():
    code, out, err = run_cmd(["gh", "pr", "list", "--repo", REPO, "--state", "open", "--limit", "200", "--json", "number,title,createdAt"])
    if code != 0:
        print(f"Error fetching PRs: {err}", file=sys.stderr)
        return []
    return json.loads(out)

def close_pr(pr_num):
    print(f"[*] Closing PR #{pr_num} (older than a month)...")
    code, out, err = run_cmd(["gh", "pr", "close", str(pr_num), "--repo", REPO, "--comment", CLOSE_COMMENT])
    if code == 0:
        print(f"[+] Successfully closed PR #{pr_num}")
        return True
    else:
        print(f"[!] Error closing PR #{pr_num}: {err}", file=sys.stderr)
        return False

def request_changes(pr_num):
    print(f"[*] Requesting changes on PR #{pr_num}...")
    code, out, err = run_cmd(["gh", "pr", "review", str(pr_num), "--repo", REPO, "-r", "-b", CONFLICT_COMMENT])
    if code == 0:
        print(f"[+] Successfully requested changes on PR #{pr_num}")
        return True
    else:
        print(f"[-] Review request-changes failed for PR #{pr_num}: {err}. Falling back to comment...")
        code2, out2, err2 = run_cmd(["gh", "pr", "comment", str(pr_num), "--repo", REPO, "-b", CONFLICT_COMMENT])
        if code2 == 0:
            print(f"[+] Successfully added conflict comment on PR #{pr_num}")
            return True
        else:
            print(f"[!] Error commenting on PR #{pr_num}: {err2}", file=sys.stderr)
            return False

def merge_pr(pr_num):
    print(f"[*] Merging PR #{pr_num}...")
    code, out, err = run_cmd(["gh", "pr", "comment", str(pr_num), "--repo", REPO, "-b", MERGE_COMMENT])
    if code != 0:
        print(f"[!] Warning: failed to post comment on PR #{pr_num}: {err}", file=sys.stderr)
    
    code, out, err = run_cmd(["gh", "pr", "merge", str(pr_num), "--repo", REPO, "--merge", "--auto=false"])
    if code == 0:
        print(f"[+] Successfully merged PR #{pr_num}")
        return True
    else:
        print(f"[-] gh pr merge returned {code}: {err}. Trying API merge endpoint...")
        code_api, out_api, err_api = run_cmd(["gh", "api", "-X", "PUT", f"repos/{REPO}/pulls/{pr_num}/merge", "-f", "merge_method=merge"])
        if code_api == 0:
            print(f"[+] Successfully merged PR #{pr_num} via API")
            return True
        else:
            print(f"[!] Merge failed for PR #{pr_num}: {err_api}", file=sys.stderr)
            return False

def main():
    global REPO
    if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
        REPO = sys.argv[1]

    print(f"Operating on repository: {REPO}")
    open_prs = get_all_open_prs()
    print(f"Total open PRs: {len(open_prs)}")
    
    merged_prs = []
    closed_prs = []
    new_changes_requested_prs = []
    already_changes_requested_prs = []
    failed_prs = []
    
    for pr_item in open_prs:
        pr_num = pr_item["number"]
        title = pr_item["title"]
        created_at_str = pr_item.get("createdAt")
        print(f"\n--- Processing PR #{pr_num}: {title} ---")
        
        # 1. Check age first: close PRs older than a month (>= 30 days)
        if created_at_str and is_older_than_a_month(created_at_str):
            if close_pr(pr_num):
                closed_prs.append(pr_num)
            else:
                failed_prs.append(pr_num)
            continue
            
        pr_data = get_pr(pr_num)
        if not pr_data:
            print(f"[!] Failed to get PR #{pr_num} data")
            failed_prs.append(pr_num)
            continue
            
        if pr_data.get("state") != "open":
            print(f"PR #{pr_num} is not open (state={pr_data.get('state')}), skipping.")
            continue
            
        if pr_data.get("draft"):
            print(f"PR #{pr_num} is draft. Marking ready...")
            run_cmd(["gh", "pr", "ready", str(pr_num), "--repo", REPO])
            time.sleep(2)
            pr_data = get_pr(pr_num)
            
        mergeable = pr_data.get("mergeable")
        mergeable_state = pr_data.get("mergeable_state")
        had_changes_requested = has_changes_requested(pr_num)
        
        print(f"PR #{pr_num} status: mergeable={mergeable}, mergeable_state={mergeable_state}, had_changes_requested={had_changes_requested}")
        
        # 2. Check if PR is mergeable (regardless of whether it previously had changes requested)
        if mergeable is True and mergeable_state != "dirty":
            if had_changes_requested:
                print(f"[+] PR #{pr_num} previously had changes requested, but has now resolved conflicts and is MERGEABLE!")
            success = merge_pr(pr_num)
            if success:
                merged_prs.append(pr_num)
                # Give GitHub backend time to update branch heads and recompute mergeability for next PRs
                time.sleep(4)
            else:
                print(f"[!] Merge failed for #{pr_num}, re-checking if it became dirty...")
                pr_data = get_pr(pr_num)
                if pr_data.get("mergeable") is False or pr_data.get("mergeable_state") == "dirty":
                    if had_changes_requested:
                        print(f"[-] PR #{pr_num} already has changes requested. Skipping duplicate request.")
                        already_changes_requested_prs.append(pr_num)
                    else:
                        if request_changes(pr_num):
                            new_changes_requested_prs.append(pr_num)
                        else:
                            failed_prs.append(pr_num)
                else:
                    failed_prs.append(pr_num)
        else:
            # 3. Has merge conflict / not mergeable
            if had_changes_requested:
                print(f"[-] PR #{pr_num} still has unresolved merge conflicts (state={mergeable_state}) and already has changes requested. Skipping duplicate request.")
                already_changes_requested_prs.append(pr_num)
            else:
                print(f"[-] PR #{pr_num} has merge conflicts (state={mergeable_state}). Requesting changes...")
                if request_changes(pr_num):
                    new_changes_requested_prs.append(pr_num)
                else:
                    failed_prs.append(pr_num)
                
    print("\n================ FINAL SUMMARY ================")
    print(f"Total Open PRs Evaluated: {len(open_prs)}")
    print(f"Total Merged ({len(merged_prs)}): {merged_prs}")
    print(f"Total Closed (Older than 1 month) ({len(closed_prs)}): {closed_prs}")
    print(f"Total Newly Changes Requested ({len(new_changes_requested_prs)}): {new_changes_requested_prs}")
    print(f"Total Conflicted (Already Changes Requested / Skipped) ({len(already_changes_requested_prs)}): {already_changes_requested_prs}")
    if failed_prs:
        print(f"Failed / Unhandled ({len(failed_prs)}): {failed_prs}")

if __name__ == "__main__":
    main()
