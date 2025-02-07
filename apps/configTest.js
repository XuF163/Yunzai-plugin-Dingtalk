import Config from "../../../plugins/Ding-plugin/lib/config.js";

export class configTest extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: "钉钉适配器测试",
      event: "message",
      /** 优先级，数字越小等级越高 */

      rule: [
        { reg: "ding", fnc: "tst" },
        { reg: "Ding", fnc: "datatest" },
      ],
    });
  }

  /**
   * updateCopyPlugin
   * @returns {Promise<boolean>}
   */
  async tst() {
    console.log("Config.testid");
    console.log(Config.clientId);
    console.log(Config.clientSecret);
    console.log(Config.webhook);
  }

  getRandomUserData() {
    const randomUsername = `user_${Math.random().toString(36).substring(2, 8)}`;
    const randomEmail = `${randomUsername}@example.com`;
    return { username: randomUsername, email: randomEmail };
  }

  async datatest() {
    const db = Database; // 使用单例实例

    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    try {
      // 使用 query 方法执行 SQL 语句
      await db.query(createTableSQL);
      console.log('Table "users" created successfully');
    } catch (error) {
      console.error("Error creating table:", error.message);
    }
    const { username, email } = this.getRandomUserData();

    const insertSQL = `
        INSERT INTO users (username, email)
        VALUES (?, ?)
    `;

    try {
      // 执行插入数据的 SQL 语句
      await db.query(insertSQL, [username, email]);
      console.log(`Inserted random user: ${username}, email: ${email}`);
    } catch (error) {
      console.error("Error inserting random data:", error.message);
    } finally {
      // 可选：插入完成后断开数据库连接
      // await db.disconnect();
    }
  }
}
