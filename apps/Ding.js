import Config from "../lib/config.js";
import { DWClient, EventAck, TOPIC_ROBOT } from "dingtalk-stream";
import https from "https";
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { sendMarkdownImage, sendMsg } from "../model/sender.js";
import imageSize from "image-size";

Bot.adapter.push(
  new (class DingDing {
    constructor() {
      this.id = "DingDing";
      this.name = "DingDing";
      this.version = `v0.4.29`;
      this.clientId = Config.clientId;
      this.clientSecret = Config.clientSecret;
      this.webhook = Config.webhook;
      this.Dingclient = new DWClient({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        debug: true,
      });
      // 移除 load() 中重复创建 Dingclient 的代码，这里已经创建
    }

    makeLog(msg) {
      return Bot.String(msg).replace(
        /base64:\/\/.*?([,\]"])/g,
        "base64://...$1",
      );
    }
    sendApi() {
      return true; // 如果有实际的 API 检查逻辑，应该在这里实现
    }

    async uploadFile(data, file) {
      // TODO: 实现文件上传逻辑
      Bot.makeLog("warn", "[DingDing] uploadFile 方法尚未实现", this.id);
    }

    async sendFriendMsg(data, msg) {
      Bot.makeLog("debug", "[DingDing friend] sendFriendMsg data 参数:", data);
      Bot.makeLog("debug", "[DingDing friend] sendFriendMsg msg 参数:", msg);
      await this._sendDingDingMsg("friend", data, msg);
      return true;
    }

    async sendGroupMsg(data, msg) {
      Bot.makeLog("debug", "[DingDing group] sendGroupMsg data 参数:", data);
      Bot.makeLog("debug", "[DingDing group] sendGroupMsg msg 参数:", msg);
      await this._sendDingDingMsg("group", data, msg);
      return true;
    }

    async _sendDingDingMsg(type, data, msg) {
      Bot.makeLog("debug", `[DingDing ${type}] _sendDingDingMsg msg 参数:`, msg);
      if (!Array.isArray(msg)) msg = [msg];

      for (const segment of msg) { // 使用 for...of 循环遍历消息段
        if (typeof segment !== "object") segment = { type: "text", text: segment };

        if (segment.type === "button") {
          Bot.makeLog("debug", `[DingDing ${type}] 忽略按钮类型消息段:`, segment);
          continue;
        }

        let file;
        if (segment.file) {
          file = await Bot.fileType(segment);
          Bot.makeLog("debug", `[DingDing ${type}] 文件类型检测结果:`, file);
          if (file?.buffer instanceof Buffer) { // 使用 ?. 链式操作符
            file.path = `data/dingding/${file.name}`;
            try {
              await fs.writeFile(file.path, file.buffer);
              file.url = `${file.url}\n路径: ${logger.cyan(file.path)}\n网址: ${logger.green(await Bot.fileToUrl(file))}`;
            } catch (error) {
              Bot.makeLog("error", `[DingDing ${type}] 写入文件失败:`, error, this.id);
            }
          } else {
            Bot.makeLog("warn", `[DingDing ${type}] 文件 buffer 无效:`, file, this.id);
          }
        }

        switch (segment.type) {
          case "text":
            if (segment.text.includes("\n")) segment.text = `发送文本: \n${segment.text}`; // 使用 includes 更简洁
            Bot.makeLog("info", `[DingDing ${type}] ${segment.text}`, this.id);
            break;
          case "image":
            if (file?.url) { // 只有当 file 和 url 都存在时才发送
              Bot.makeLog(
                "info",
                `[DingDing ${type}] 发送图片: ${file.url}`,
                this.id,
              );
              await sendMarkdownImage(data, file, data.sessionWebhook); // 确保 data.sessionWebhook 存在
              Bot.makeLog("info", Imgurl); // 注意 Imgurl 可能未定义
            } else {
              Bot.makeLog("warn", `[DingDing ${type}] 图片文件信息不完整，无法发送`, segment, this.id);
            }
            break;
          case "record":
            if (file?.url) {
              Bot.makeLog(
                "info",
                `[DingDing ${type}] 发送音频: ${file.url}`,
                this.id,
              );
              // TODO: 实现发送音频的逻辑
            } else {
              Bot.makeLog("warn", `[DingDing ${type}] 音频文件信息不完整，无法发送`, segment, this.id);
            }
            break;
          case "video":
            if (file?.url) {
              Bot.makeLog(
                "info",
                `[DingDing ${type}] 发送视频: ${file.url}`,
                this.id,
              );
              // TODO: 实现发送视频的逻辑
            } else {
              Bot.makeLog("warn", `[DingDing ${type}] 视频文件信息不完整，无法发送`, segment, this.id);
            }
            break;
          case "file":
            if (file?.url) {
              Bot.makeLog(
                "info",
                `[DingDing ${type}] 发送文件: ${file.url}`,
                this.id,
              );
              // TODO: 实现发送文件的逻辑
            } else {
              Bot.makeLog("warn", `[DingDing ${type}] 文件信息不完整，无法发送`, segment, this.id);
            }
            break;
          case "reply":
          case "at":
            break; // 可以添加日志说明这些类型在钉钉适配器中没有特殊处理
          case "node":
            await Bot.sendForwardMsg(
              (forwardMsg) => this._sendDingDingMsg(type, data, forwardMsg),
              segment.data,
            );
            break;
          default:
            Bot.makeLog("warn", `[DingDing ${type}] 未知消息类型:`, segment, this.id);
        }
      }

      let textContent = ""; // 提取所有文本消息段的内容
      if (Array.isArray(msg)) {
        textContent = msg.filter(m => m?.type === 'text').map(m => m.text).join('\n').trim();
      } else if (typeof msg === "string") {
        textContent = msg.trim();
      }

      const atUserIds = data?.user_id ? [data.user_id] : 0// 更安全地获取 atUserIds

      const textMessagePayload = {
        msgtype: "text",
        text: {
          content: textContent,
        },
        at: {
          atUserIds: atUserIds,
        },
      };

      if (type === "friend") {
        Bot.makeLog("debug", "[DingDing friend] 尝试发送文本消息:", textMessagePayload);
        this._replyMessage(data.sessionWebhook, textMessagePayload);
        return true;
      } else if (type === "group") {
        Bot.makeLog("debug", "[DingDing group] 尝试发送文本消息:", textMessagePayload);
        // TODO: 实现群消息发送逻辑，可能需要不同的 API 调用
        this._replyMessage(data.sessionWebhook, textMessagePayload); // 临时使用相同的回复方法，需要替换为正确的群消息发送逻辑
        return Promise.resolve({ message_id: Date.now().toString(36) }).then(() => true);
      } else {
        Bot.makeLog("warn", `[DingDing] 未知消息类型 (friend/group): ${type}`, this.id);
        return Promise.reject(new Error(`Unknown message type: ${type}`));
      }
    }

    async makeMsg(data, msg, send) {
      Bot.makeLog("debug", "[DingDing] makeMsg data:", data, "msg:", msg, "send:", send);
      // TODO: 实现 makeMsg 的逻辑，根据需要处理消息的创建
    }

    async getFriendArray(data) {
      Bot.makeLog("debug", "[DingDing] getFriendArray data:", data);
      // TODO: 实现获取好友列表的逻辑
      return;
    }

    async getFriendList(data) {
      Bot.makeLog("debug", "[DingDing] getFriendList data:", data);
      // TODO: 实现获取好友列表的逻辑
      return {};
    }

    async getFriendMap(data) {
      Bot.makeLog("debug", "[DingDing] getFriendMap data:", data);
      // TODO: 实现获取好友 Map 的逻辑
      return new Map();
    }

    async getFriendInfo(data) {
      Bot.makeLog("debug", "[DingDing] getFriendInfo data:", data);
      // TODO: 实现获取好友信息的逻辑
      return {};
    }

    async getGroupArray(data) {
      Bot.makeLog("debug", "[DingDing] getGroupArray data:", data);
      // TODO: 实现获取群组列表的逻辑
      return;
    }

    async getGroupList(data) {
      Bot.makeLog("debug", "[DingDing] getGroupList data:", data);
      // TODO: 实现获取群组列表的逻辑
      return {};
    }

    async getGroupMap(data) {
      Bot.makeLog("debug", "[DingDing] getGroupMap data:", data);
      // TODO: 实现获取群组 Map 的逻辑
      return new Map();
    }

    async getGroupInfo(data) {
      Bot.makeLog("debug", "[DingDing] getGroupInfo data:", data);
      // TODO: 实现获取群组信息的逻辑
      return {};
    }

    async getMemberArray(data) {
      Bot.makeLog("debug", "[DingDing] getMemberArray data:", data);
      // TODO: 实现获取群组成员列表的逻辑
      return;
    }

    async getMemberList(data) {
      Bot.makeLog("debug", "[DingDing] getMemberList data:", data);
      // TODO: 实现获取群组成员列表的逻辑
      return {};
    }

    async getMemberMap(data) {
      Bot.makeLog("debug", "[DingDing] getMemberMap data:", data);
      // TODO: 实现获取群组成员 Map 的逻辑
      return new Map();
    }

    async getGroupMemberMap(data) {
      Bot.makeLog("debug", "[DingDing] getGroupMemberMap data:", data);
      // TODO: 实现获取群组成员 Map 的逻辑
      return new Map();
    }

    async getMemberInfo(data) {
      Bot.makeLog("debug", "[DingDing] getMemberInfo data:", data);
      // TODO: 实现获取成员信息的逻辑
      return {};
    }

    pickMember(data, group_id, user_id) {
      Bot.makeLog("debug", "[DingDing] pickMember data:", data, group_id, user_id);
      // TODO: 实现选择群成员的逻辑
    }

    pickGroup(data, group_id) {
      Bot.makeLog("debug", "[DingDing] pickGroup data:", data, group_id);
      // TODO: 实现选择群组的逻辑
    }

    async connect(data, ws) {
      Bot.makeLog("debug", "[DingDing] connect data:", data, "ws:", ws);
      // TODO: 实现连接逻辑，如果需要的话
    }

    makeNotice(data) {
      Bot.makeLog("debug", "[DingDing] makeNotice data:", data);
      // TODO: 实现处理通知的逻辑
    }

    makeRequest(data) {
      Bot.makeLog("debug", "[DingDing] makeRequest data:", data);
      // TODO: 实现处理请求的逻辑
    }

    makeMeta(data, ws) {
      Bot.makeLog("debug", "[DingDing] makeMeta data:", data, "ws:", ws);
      // TODO: 实现处理元数据的逻辑
    }

    message(data, ws) {
      Bot.makeLog("debug", "[DingDing] message data:", data, "ws:", ws);
      // TODO: 实现处理原始消息的逻辑，如果需要的话
    }

   makeMessage(event) {
      Bot.makeLog("debug", "[DingDing] makeMessage 原始 event.data:", event.data.toString());

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        this.makeLog(`Error parsing message data: ${e}`);
        return;
      }

      if (!data) {
        this.makeLog("Warning: Received empty message data after parsing.");
        return;
      }

      data.message = [
        { type: "text", text: (data?.text?.content || "").trim() },
      ];
      data.raw_message = data.text.content;

      Bot.makeLog("debug", "[DingDing] makeMessage data.message:", data.message);
      Bot.makeLog("debug", "[DingDing] makeMessage data.raw_message:", data.raw_message);

      data.post_type = "message";
      data.message_type = data.conversationType === "2" ? "group" : "private";
      data.self_id = this.clientId;
      data.user_id = data.senderId;
      data.sender = {
        user_id: data.senderId,
        nickname: data.senderNick,
        // 可以根据需要添加更多 sender 信息，例如 role, isAdmin 等
      };

      // 添加适配器信息到 data 对象
      const adapterInfo = Bot[this.id]?.adapter;
      if (adapterInfo) {
        data.adapter = {
          id: adapterInfo.id,
          name: adapterInfo.name,
          version: adapterInfo.version,
        };
      } else {
        data.adapter = {
          id: this.id,
          name: this.name,
          version: this.version,
        };
      }
      data.adapter_id = data.adapter.id;
      data.adapter_name = data.adapter.name;

      if (data.message_type === "group") {
        data.group_id = data.conversationId;
        data.group_name = data.conversationTitle;
        Bot.makeLog(
          "info",
          `钉钉群消息：[${data.group_name}, ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`,
          `${data.self_id} <= ${data.group_id}, ${data.user_id}`,
          true,
        );
        Bot.em(`message.dingding.group`, data);
      } else if (data.message_type === "private") {
        Bot.makeLog(
          "info",
          `钉钉私聊消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`,
          `${data.self_id} <= ${data.user_id}`,
          true,
        );
        Bot.em(`message.dingding.private`, data);
      } else {
        Bot.makeLog(
          "warn",
          `未知钉钉消息类型：${logger.magenta(event.data)}`,
          data.self_id,
        );
        Bot.em(`message.dingding.unknown`, data);
      }

      data.reply = async (msg) => {
        if (!Array.isArray(msg)) msg = [msg];

        for (const segment of msg) {
          if (typeof segment !== 'object') segment = { type: 'text', text: segment };

          if (segment.type === 'button') {
            Bot.makeLog("debug", "[DingDing] data.reply 发现按钮对象，已忽略:", segment);
            continue;
          }

          if (data.message_type === "private") {
            if (segment.type === 'text') {
              await sendMsg(segment.text, data.sessionWebhook);
            } else if (segment.type === 'image') {
              Bot.makeLog("debug", "[DingDing] data.reply - segment:", segment);
              Bot.makeLog("debug", "[DingDing] data.reply - segment.file:", segment.file);
              Bot.makeLog("debug", "[DingDing] data.reply - segment.file (full):", segment.file, { depth: null });
              if (segment.file) {
                segment.file.name = 'image.png'; // 强制设置文件名，避免一些潜在问题
                await sendMarkdownImage(data, segment.file, data.sessionWebhook, '图片');
              } else {
                Bot.makeLog("warn", "[DingDing] data.reply 私聊 - 图片消息 segment.file 为空", segment);
              }
            } else {
              Bot.makeLog("warn", "[DingDing] data.reply 私聊 -  不支持的消息类型回复", segment.type, segment);
            }
          } else if (data.message_type === "group") {
            if (segment.type === 'text') {
              await sendMsg(segment.text, data.sessionWebhook);
            } else if (segment.type === 'image') {
              if (segment.file) {
                segment.file.name = 'image.png'; // 强制设置文件名
                await sendMarkdownImage(data, segment.file, data.sessionWebhook, '图片');
              } else {
                Bot.makeLog("warn", "[DingDing] data.reply 群聊 - 图片消息 segment.file 为空", segment);
              }
            } else {
              Bot.makeLog("warn", "[DingDing] data.reply 群聊 - 不支持的消息类型回复", segment.type, segment);
            }
          } else {
            Bot.makeLog(
              "warn",
              "[DingDing] data.reply - 不支持的消息类型回复", data.message_type, segment
            );
          }
        }
        return true;
      };
    }
    async makeBotImage (file) {
      if (config?.toBotUpload) { // 使用可选链操作符 ?. 更安全地访问 config
        for (const i of Bot.uin) {
          if (!Bot[i]?.dingUploadImage) continue // 使用可选链操作符 ?.
          try {
            const image = await Bot[i].dingUploadImage(file);
            if (image?.url) { // 使用可选链操作符 ?.
              return image;
            }
          } catch (err) {
            Bot.makeLog('error', ['Bot', i, '钉钉图片上传错误', file, err]);
          }
        }
      }
      return undefined;
    }

    async makeMarkdownImage (data, file, summary = '图片') {
      try {
        const buffer = await Bot.Buffer(file);
        const image =
          await this.makeBotImage(buffer) ||
          { url: await Bot.fileToUrl(file) };

        if (!image?.width || !image?.height) { // 使用可选链操作符 ?.
          try {
            const size = imageSize(buffer);
            image.width = size.width;
            image.height = size.height;
          } catch (err) {
            Bot.makeLog('error', ['图片分辨率检测错误', file, err], data.self_id);
          }
        }

        const scale = config?.markdownImgScale ?? 1; // 使用空值合并运算符 ?? 提供默认值
        image.width = Math.floor((image.width || 0) * scale); // 使用 || 0 避免 undefined 参与计算
        image.height = Math.floor((image.height || 0) * scale);

        return {
          des: `![${summary} #${image.width}px #${image.height}px]`, // 简化 markdown 格式
          url: `(${image.url})`
        };
      } catch (error) {
        Bot.makeLog('error', ['makeMarkdownImage 发生错误', file, error], data.self_id);
        return { des: `![${summary}]`, url: `()` }; // 出错时返回一个默认值，避免程序崩溃
      }
    }
async getBotInfo() {
      // TODO: 使用 DingTalk SDK 的方法获取机器人信息
      // 示例 (需要根据实际 SDK 方法调整):
      //const info = await this.Dingclient.getBotInfo();
      return {
        nick: "DingDing机器人", // 替换为实际获取的昵称
        avatarUrl: "https://img.kookapp.cn/assets/2025-03/23/4nzb8Kpe0r05k05k.png", // 替换为实际获取的头像 URL
      };
    }

    async load() {
      const Dingclient = this.Dingclient;
      const onBotMessage = async (event) => {
        const messageId = event.headers?.messageId;
        this.makeLog("Raw event.data: " + event.data.toString());
        if (!messageId) {
          this.makeLog(
            "Warning: messageId is missing in event headers, cannot send socketCallBackResponse.",
          );
        } else {
          this.makeLog(`Message received with messageId: ${messageId}`);
        }

        let message = JSON.parse(event.data);
        let content = (message?.text?.content || "").trim();

        this.makeMessage(event);

        if (messageId) {
          Dingclient.socketCallBackResponse(messageId);
        }

        return { status: EventAck.SUCCESS, message: "OK" };
      };

      await Dingclient.registerCallbackListener(TOPIC_ROBOT, onBotMessage)
        .connect();

      const id = this.id;
      const bot = this.Dingclient;

      if (!Bot[id]) {
        Bot[id] = {
          adapter: this,
          sdk: bot,
          info: await this.getBotInfo(),
          uin: id,
          get nickname() { return this.info?.nick },
          get avatar() { return this.info?.avatarUrl },
          version: {
            id: this.id,
            name: this.name,
            version: this.version,
          },
          stat: { start_time: Date.now() / 1000 },

          pickFriend: user_id => this.pickFriend(id, user_id),
          get pickUser() { return this.pickFriend },

          pickMember: (group_id, user_id) => this.pickMember(id, group_id, user_id),
          pickGroup: group_id => this.pickGroup(id, group_id),

          getGroupArray: () => this.getGroupArray(id),
          getGroupList: () => this.getGroupList(id),
          getGroupMap: () => this.getGroupMap(id),

          fl: new Map(),
          gl: new Map(),
          gml: new Map(),
        };

        bot.on("message", data => this.makeMessage(data));
        bot.on("event", data => this.makeEvent(id, data));

        Bot.makeLog("mark", `${this.name}(${this.id}) ${this.version} 已连接`, id);
        Bot.em(`connect.${id}`, { self_id: id });
      }

      return true;
    }

    // async makeEvent(id, data) {
    //   Bot.makeLog("debug", `[DingDing ${id}] makeEvent 接收到事件:`, data);
    //   // TODO: 实现处理各种事件的逻辑，例如群成员变动等
    // }
    //
    // async _replyMessage(webhook, payload) {
    //   try {
    //     const response = await fetch(webhook, {
    //       method: 'POST',
    //       headers: {
    //         'Content-Type': 'application/json'
    //       },
    //       body: JSON.stringify(payload)
    //     });
    //
    //     if (!response.ok) {
    //       const errorText = await response.text();
    //       Bot.makeLog('error', '[DingDing] _replyMessage 发送失败:', response.status, response.statusText, errorText, 'Payload:', payload);
    //     } else {
    //       Bot.makeLog('debug', '[DingDing] _replyMessage 发送成功:', payload);
    //     }
    //   } catch (error) {
    //     Bot.makeLog('error', '[DingDing] _replyMessage 请求错误:', error, 'Payload:', payload);
    //   }
    // }

//     // TODO: 实现 pickFriend, pickMember, pickGroup, getGroupArray, getGroupList, getGroupMap 等方法
//     async pickFriend(id, user_id) {
//       // 实现获取好友对象逻辑
//       return { sendMsg: async (msg) => console.log(`发送私聊消息给 ${user_id}:`, msg) };
//     }
//
//     async pickMember(id, group_id, user_id) {
//       // 实现获取群成员对象逻辑
//       return { sendMsg: async (msg) => console.log(`在群组 ${group_id} 中发送消息给 ${user_id}:`, msg) };
//     }
//
//     async pickGroup(id, group_id) {
//       // 实现获取群组对象逻辑
//       return { sendMsg: async (msg) => console.log(`在群组 ${group_id} 中发送消息:`, msg) };
//     }
//
//     async getGroupArray(id) {
//       // 实现获取群组列表逻辑
//       return;
//     }
//
//     async getGroupList(id) {
//       // 实现获取群组 ID 列表逻辑
//       return;
//     }
//
//     async getGroupMap(id) {
//       // 实现获取群组信息 Map 逻辑
//       return new Map();
//     }
//   })(),
// );
//
    async makeEvent(id, data) {
      Bot.makeLog("debug", `[DingDing ${id}] makeEvent 接收到事件:`, data);
      // TODO: 实现处理各种事件的逻辑，例如群成员变动等
    }

    async _replyMessage(webhook, payload) {
      try {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          Bot.makeLog('error', '[DingDing] _replyMessage 发送失败:', response.status, response.statusText, errorText, 'Payload:', payload);
        } else {
          Bot.makeLog('debug', '[DingDing] _replyMessage 发送成功:', payload);
        }
      } catch (error) {
        Bot.makeLog('error', '[DingDing] _replyMessage 请求错误:', error, 'Payload:', payload);
      }
    }
  })(),
);
