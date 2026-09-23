Set WshShell = CreateObject("WScript.Shell")

' Kill existing
WshShell.Run "powershell -WindowStyle Hidden -Command """ & _
    "Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | " & _
    "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
WScript.Sleep 1200

' AI Router — node directly, hidden
WshShell.CurrentDirectory = "C:\AI-Router"
WshShell.Run "node index.js", 0, False
WScript.Sleep 3000

' FreeLLM server only (sirf backend, koi vite frontend nahi)
WshShell.CurrentDirectory = "C:\Users\basic\freellmapi"
WshShell.Run "node_modules\.bin\tsx watch src\index.ts", 0, False
WScript.Sleep 2000

MsgBox "✅ Services start ho gayi!" & vbNewLine & vbNewLine & _
       "AI Router  →  http://localhost:3000" & vbNewLine & _
       "FreeLLM    →  http://localhost:3001" & vbNewLine & vbNewLine & _
       "Koi CMD window nahi! Background mein chal rahi hain.", _
       vbInformation, "AI Services — Started"

Set WshShell = Nothing
