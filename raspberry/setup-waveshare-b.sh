#! /bin/bash
#set up RS485 CAN HAT (B) (https://www.waveshare.com/wiki/RS485_CAN_HAT_(B))
#return 0 if ok, 1 if needs reboot, -1 on error 
#set -x
#testing
BASE=/

WS_COMMENT="#WAVESHAREB_DO_NOT_DELETE"

pdir=`dirname $0`
pdir=`readlink -f "$pdir"`
. $pdir/setup-helper.sh

#/boot/config.txt
read -r -d '' CFGPAR <<'CFGPAR'
dtparam=spi=on
dtoverlay=mcp2515-can0,oscillator=16000000,interrupt=25,,spimaxfrequency=1000000
dtoverlay=sc16is752-spi1,int_pin=24
CFGPAR

#/etc/network/interfaces.d/can0
CAN0CHECK='can0'
read -r -d '' CAN0 << 'CAN0'
#physical can interfaces
auto can0
iface can0 can static
bitrate 250000
pre-up ip link set can0 type can restart-ms 100
down /sbin/ip link set $IFACE down
up /sbin/ifconfig $IFACE txqueuelen 10000
CAN0

needsReboot=0
if [ "$1" = remove ] ; then
    removeConfig $BOOTCONFIG "$WS_COMMENT" "$CFGPAR"
    checkRes
    exit $needsReboot
fi

checkConfig "$BOOTCONFIG" "$WS_COMMENT" "$CFGPAR"
checkRes
can="$BASE/etc/network/interfaces.d/can0"
replaceConfig "$can" "$CAN0"
checkRes
$pdir/uart_control gpio

log "needReboot=$needsReboot"
exit $needsReboot
