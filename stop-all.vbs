Set WshShell = CreateObject("WScript.Shell")

WshShell.Run "powershell -WindowStyle Hidden -Command """ & _
    "Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | " & _
    "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True

MsgBox "✅ AI Services band ho gayi!" & vbNewLine & vbNewLine & _
       "AI Router aur FreeLLM dono stop.", _
       vbInformation, "AI Services — Stopped"

Set WshShell = Nothing
