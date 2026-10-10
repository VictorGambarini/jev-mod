# `/jev-mod status`

Shows the backend (and whether it is on this machine), where its key came from (never the key), a live check naming the backend and model that answered, any warning about its answers, each feature's mode, and today's spend.

It also lists any config setting that was passed over and why, and the session's routing state: your `/model`, a Jev version drift, an untuned backend.

The check is one small yes/no request. It counts against the daily budget like any other call, and is not made once the budget is spent or in private mode. A refused key or an account out of credit stops the mod for thirty minutes, or until a call answers again; `/jev-mod status` checks at once after you replace the key. When the check fails, it says what to do about it.
