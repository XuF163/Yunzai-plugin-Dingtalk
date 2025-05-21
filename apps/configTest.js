import Config from "../../../plugins/Ding-plugin/lib/config.js";

export default class configTest extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: "钉钉适配器测试",
      event: "message",
      /** 优先级，数字越小等级越高 */

      rule: [
        { reg: "ding", fnc: "tst" },
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



}


