# SQLite 存储选型决议

日期：2026-08-27
状态：accepted for local Demo

## 决议

本地 Demo 使用 `better-sqlite3@12.4.6`，每个世界使用一个 SQLite 文件。该版本固定写入 lockfile，不自动追随最新 major/minor。

## 原因

- 当前运行环境是 Node `v20.19.2`；内置 `node:sqlite` 从 Node 22.5 才加入，不能作为当前基线；
- `better-sqlite3@12.4.6` 的包元数据声明支持 Node 20，且当前 Linux 环境已验证可安装和运行；
- 同步事务与 Demo 的单 writer Commit 边界一致，避免再引入异步连接池；
- Phase 6 测试已经覆盖关闭并重开数据库后的 replay 与 Experience pending recovery。

## 数据边界

- `world_commits`：只追加的 Canon 世界提交；
- `experience_commits`：按 observer/source height 唯一的认识提交；
- `attempt_audit`：可更新的非权威审计；
- WAL 用于崩溃恢复与读写行为；
- 外键保证 ExperienceCommit 引用已经存在的 World Height；
- JSONL 仅用于只读检查和导出，不作为重放权威。

## 已知约束

- 原生 addon 与 Node ABI 有关；升级 Node 或驱动时必须重新运行安装和跨进程测试；
- 当前 schema 假定一个数据库文件只承载一个 world；多世界部署需要把 `world_id` 加入复合主键或按文件隔离；
- SQLite 适配器不改变领域层 root、幂等和 replay 规则；
- 若未来部署到 Cloudflare Workers，应单独实现 D1/DO 适配器，不能把本地原生 addon 带入 Worker runtime。
