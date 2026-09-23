# Services ko background mein start karo (hidden)
Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | 
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

# AI Router — hidden
Start-Process -FilePath "node" -ArgumentList "index.js" `
    -WorkingDirectory "C:\AI-Router" -WindowStyle Hidden

Start-Sleep -Seconds 2

# FreeLLM — hidden  
Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev" `
    -WorkingDirectory "C:\Users\basic\freellmapi" -WindowStyle Hidden
