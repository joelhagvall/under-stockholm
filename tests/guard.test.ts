import { expect, test } from 'bun:test';
import { blocked } from '../scripts/hooks/guard';

test('deploys around `bun run deploy` are blocked', () => {
  for (const command of ['bunx wrangler deploy', 'npx wrangler pages deploy dist', 'bun run deploy && bunx wrangler deploy', 'bunx wrangler deploy --dry-run; bunx wrangler deploy', 'vercel --prod', 'rsync -a dist/ host:/www', 'aws s3 sync dist s3://site']) {
    expect(blocked(command)).toBe('deploy');
  }
  for (const command of ['bun run deploy', 'SITE_URL=https://x.se/ bun run deploy --dry-run', 'bunx wrangler dev', 'bunx wrangler deploy --dry-run', 'vercel env ls']) {
    expect(blocked(command)).toBeNull();
  }
});

test('pushes that skip the gate are blocked, ordinary ones are not', () => {
  for (const command of ['git push --no-verify origin main', 'git push -n', 'SKIP_CHECK=1 git push', 'git -c core.hooksPath=/dev/null push', 'git config core.hooksPath .git/hooks']) {
    expect(blocked(command)).toBe('skip');
  }
  for (const command of ['git push origin main', 'git push -u origin feature', 'git config core.hooksPath scripts/hooks', 'git status']) {
    expect(blocked(command)).toBeNull();
  }
});

test('text is not a command: heredocs, quotes and comments pass', () => {
  expect(blocked("cat > x.md <<'EOF'\nNever run `wrangler deploy`, never push with --no-verify.\nEOF\necho done")).toBeNull();
  expect(blocked("grep -rn 'wrangler deploy' scripts")).toBeNull();
  expect(blocked('echo "never run wrangler deploy"')).toBeNull();
  expect(blocked('git add -A # then wrangler deploy later\ngit status')).toBeNull();
  // What follows the heredoc still counts.
  expect(blocked("cat > x <<'EOF'\ntext\nEOF\nbunx wrangler deploy")).toBe('deploy');
});
