Set WshShell = CreateObject("WScript.Shell")

' PowerShell script hidden mein chalao — koi window nahi!
WshShell.Run "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\AI-Router\start-hidden.ps1", 0, True

WScript.Sleep 1000

MsgBox "✅ AI Services start ho gayi!" & vbNewLine & vbNewLine & _
       "AI Router  →  http://localhost:3000" & vbNewLine & _
       "FreeLLM    →  http://localhost:3001" & vbNewLine & vbNewLine & _
       "Koi CMD window nahi khula!" & vbNewLine & _
       "Band karne ke liye: STOP.vbs double-click karo.", _
       vbInformation, "AI Services — Started"

Set WshShell = Nothing
