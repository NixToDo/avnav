#! /bin/bash
#set up PICAN-M (https://cdn.shopify.com/s/files/1/0563/2029/5107/files/pican-m_UGB_20.pdf?v=1619008196)
#return 0 if ok, 1 if needs reboot, -1 on error 
#set -x
#testing
pdir=`dirname $0`
pdir=`readlink -f "$pdir"`
. "$pdir/setup-helper.sh"
BASE=/
WS_COMMENT="#PICAN-M_DO_NOT_DELETE"
#/boot/config.txt
read -r -d '' CFGPAR <<'CFGPAR'
dtparam=i2c_arm=on
dtparam=spi=on
dtoverlay=mcp2515-can0,oscillator=16000000,interrupt=25
CFGPAR

#/etc/network/interfaces.d/can0
read -r -d '' CAN0 << 'CAN0'
#physical can interfaces
auto can0
iface can0 can static
bitrate 250000
pre-up ip link set can0 type can restart-ms 100
down /sbin/ip link set $IFACE down
up /sbin/ifconfig $IFACE txqueuelen 10000
CAN0

can="$BASE/etc/network/interfaces.d/can0"
needsReboot=0
if [ "$1" = "remove" ]; then
  removeConfig "$BOOTCONFIG" "$WS_COMMENT"
  checkRes
  exit $needsReboot
fi

checkConfig "$BOOTCONFIG" "$WS_COMMENT" "$CFGPAR"
checkRes

replaceConfig "$can" "$CAN0"
checkRes
$pdir/uart_control gpio

log "needReboot=$needsReboot"
exit $needsReboot
