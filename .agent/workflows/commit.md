---
description: How to commit and push changes following project conventions
---

// turbo-all
1. Check the status of the repository
```powershell
& 'C:\Program Files\Git\cmd\git.exe' status
```

2. Stage the modified files
```powershell
& 'C:\Program Files\Git\cmd\git.exe' add <files>
```

3. Commit the changes using Conventional Commits
```powershell
& 'C:\Program Files\Git\cmd\git.exe' commit -m "<type>: <description>"
```
