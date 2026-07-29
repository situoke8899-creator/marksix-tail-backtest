# 新澳门六合彩 V4｜100期 + 永久冻结

## V4修复
1. API先读取最新一期，再按最新期号年份抓历史，避免服务器时区/年份问题。
2. 页面展示最近100期。
3. 后台额外抓60期作为滚动回测上下文，因此“近100期”可以完整统计，不再只有80期上下文。
4. 年度历史接口失败时，自动用按期号接口补数据。
5. 每一期的9生肖、4头、8尾方案在开奖前保存到浏览器localStorage。
6. 开奖后只追加中/未中，不重算旧预测。
7. 历史没有冻结记录时，只使用该期之前的数据补建一次，之后永久锁定。

## 冻结说明
冻结保存在当前浏览器 localStorage。
同一浏览器刷新、第二天打开、重新加载，旧记录都不会变化。
清除浏览器站点数据、换浏览器/换设备会丢失本地冻结记录。

## API
- 最新：https://macaumarksix.com/api/macaujc2.com
- 历史：https://history.macaumarksix.com/history/macaujc2/y/{year}
- 按期号：https://history.macaumarksix.com/history/macaujc2/expect/{expect}
