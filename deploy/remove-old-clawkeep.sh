#!/usr/bin/env bash
# Remove the old ClawKeep (OpenCrabShell) app from this box. Shows what it finds, then asks.
# Run as root:  bash /opt/playing-god/deploy/remove-old-clawkeep.sh
set -uo pipefail
echo "== old ClawKeep leftovers on this box =="
echo "-- pm2 processes that look like it:"
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const p of JSON.parse(s)){const cwd=p.pm2_env&&p.pm2_env.pm_cwd||"";if(/claw|crab|openshell/i.test(p.name+" "+cwd))console.log("   ",p.name,"->",cwd)}}catch{}})'
echo "-- directories:"
ls -d /opt/*claw* /opt/*crab* /opt/*openshell* /var/www/*claw* /root/*claw* /root/OpenShell 2>/dev/null | sed 's/^/    /' || true
echo "-- nginx blocks set aside:"
ls /etc/nginx/sites-available/*.disabled-by-playing-god 2>/dev/null | sed 's/^/    /' || echo "    none"
echo
read -r -p "Delete all of the above? Type yes to proceed: " ok
[ "$ok" = "yes" ] || { echo "left alone."; exit 0; }
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const p of JSON.parse(s)){const cwd=p.pm2_env&&p.pm2_env.pm_cwd||"";if(/claw|crab|openshell/i.test(p.name+" "+cwd))console.log(p.name)}}catch{}})' | while read -r n; do [ -n "$n" ] && pm2 delete "$n" >/dev/null && echo "stopped $n"; done
pm2 save >/dev/null 2>&1 || true
for d in /opt/*claw* /opt/*crab* /opt/*openshell* /var/www/*claw* /root/*claw* /root/OpenShell; do [ -e "$d" ] && rm -rf "$d" && echo "removed $d"; done
rm -f /etc/nginx/sites-available/*.disabled-by-playing-god && echo "removed the set-aside nginx blocks"
nginx -t >/dev/null 2>&1 && systemctl reload nginx
echo "done. clawkeep.io belongs to Playing God alone."
