# Five-Minute Demo Guide

For the full demo walkthrough, see [docs/DEMO.md](./docs/DEMO.md).

### Quick Demo Reproduction

```bash
# 1. Copy bundled demo workspace to a temporary directory
cp -r demo-workspace /tmp/slothdesk-demo

# 2. Build and start SlothDesk AI
npm run build
npm start

# 3. Open browser
open http://localhost:3147
```

In the web interface:
1. Under **Workspace**, enter `/tmp/slothdesk-demo` and click **Run dry-run scan**.
2. Inspect the 4 scanned files, 1 cryptographic duplicate (`meeting-notes.md`), and extracted action items.
3. Review tabular stats in the **CSV Lab**.
4. In **Review Center**, click **Approve selected operations**.
5. Verify files move into `actionable/` and `dataset/` subfolders.
6. Click **Rollback completed operations** to safely restore the original directory layout.
