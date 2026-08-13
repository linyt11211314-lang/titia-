#!/usr/bin/env bash
# Titia 时序 · E2E 回归（CDP headless Chromium）
# 用法：bash scripts/e2e/run-all.sh [BASE_URL]
#   不带参数默认本地 preview http://127.0.0.1:4185；传线上地址可对线上回归。
# 依赖：node ≥18（WebSocket 内置）、chromium 可执行（PATH 中名为 chromium）。

set -u
BASE="${1:-http://127.0.0.1:4185}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
FAILED_NAMES=()

# 清理上次残留的 Chromium 数据目录（避免脚本间数据串扰；全部是测试目录）
rm -rf /tmp/cdp-* 2>/dev/null || true
# 清理上次残留的 Chromium 进程（异常退出会占用调试端口，导致后续脚本连错对象）
pkill -f 'remote-debugging-port' 2>/dev/null || true
sleep 1

run() {
  local name="$1"
  echo "── $name ──"
  if BASE="$BASE" node "$HERE/$name.mjs" >/tmp/e2e-$name.log 2>&1; then
    PASS=$((PASS + 1))
    echo "  ✔ $name 通过"
  else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$name")
    echo "  ✘ $name 失败（日志尾部）："
    tail -n 6 /tmp/e2e-$name.log | sed 's/^/    /'
  fi
}

# 数据型模块（各自清理/种入数据，顺序执行避免端口/目录冲突）
run bookcheck
run bookcheck3
run bookcheck4
run countdowncheck3
run countdowncheck4
run countdowncheck5
run mixcheck
run scrollcheck2
# aicheck 依赖本地 http mock AI 代理（127.0.0.1:9788）；线上 https 页面受浏览器
# mixed-content 限制无法访问本地 http 地址，故仅本地运行（本地回归已覆盖）
if [[ "$BASE" == https://* ]]; then
  echo "── aicheck ──"
  echo "  ⏭ 跳过（线上 https 页面无法访问本地 http mock AI 代理；本地回归已覆盖）"
else
  run aicheck
fi
run capturecheck
run delcheck
run synccheck
run rulescheck
run crosscheck
run vaultdismiss
# 本轮新增：今日打卡面板 / 日记关系列表筛选预览 / 账单按日分组双指多选购物修改
run checkincheck
run diarylistcheck
run billgroupcheck
run fabopacitycheck
run v3check
run v3fixcheck
# 交互/布局型
run navcheck
run scrollfix
run interact3
run tabcheck
run ptrcheck
# 主题/设置型
run skincheck
run clashcheck
run settingscheck
# 静态审计（无需浏览器）
echo "── contrast（静态对比度审计）──"
if node "$HERE/contrast.mjs" >/tmp/e2e-contrast.log 2>&1; then
  PASS=$((PASS + 1))
  echo "  ✔ contrast 通过"
else
  FAIL=$((FAIL + 1))
  FAILED_NAMES+=("contrast")
  tail -n 6 /tmp/e2e-contrast.log | sed 's/^/    /'
fi

echo ""
echo "════════ 汇总：$PASS 组通过 / $FAIL 组失败 ════════"
if [ "$FAIL" -gt 0 ]; then
  printf '失败组：%s\n' "${FAILED_NAMES[*]}"
  exit 1
fi
