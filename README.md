# 新澳门六合彩预测系统 V4.1｜直接导入版

此 ZIP 已经修复为“项目文件直接在根目录”的结构。

解压后应该直接看到：

```text
app/
package.json
next.config.js
README.md
```

不要再把外层文件夹整体套一层上传。

## 功能
- 新澳门六合彩最近100期开奖
- 最多160期回测上下文
- 9生肖10套优化公式
- 头数10套优化公式
- 尾数10套优化公式
- 20 / 30 / 50 / 100期滚动回测
- 下一期开奖前自动冻结方案
- 开奖后固定中 / 未中
- 历史没有冻结记录时按“该期之前的数据”补建一次后永久锁定

## API
- 最新开奖：macaumarksix.com/api/macaujc2.com
- 年度历史：history.macaumarksix.com/history/macaujc2/y/{year}
- 按期号备用：history.macaumarksix.com/history/macaujc2/expect/{expect}

## GitHub 上传
把本 ZIP 解压后里面的所有内容上传到仓库根目录。

## Vercel
Framework Preset：Next.js
Root Directory：留空 / 根目录
Build Command：默认
Install Command：默认

部署成功后先访问：
`/api/history`

确认返回：
`"ok": true`

## 冻结说明
冻结使用浏览器 localStorage。
同一浏览器刷新或第二天打开不会改变。
清除站点数据 / 换浏览器 / 换电脑会失去本地冻结记录。
