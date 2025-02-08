import Config from "../lib/config.js";
import { DWClient, EventAck, TOPIC_ROBOT } from "dingtalk-stream";
import https from "https";
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import {sendMarkdownImage, sendMsg} from "../model/sender.js";
import fileUpload from "../../genshin/model/oss/FileToUrl.js";
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
    }

    makeLog(msg) {
      return Bot.String(msg).replace(
        /base64:\/\/.*?(,|]|")/g,
        "base64://...$1",
      );
    }
    sendApi() {
      return true;
    }

    async uploadFile(data, file) {}

    async sendFriendMsg(data, msg) {
      console.log("sendFriendMsg data 参数:", data); // 打印 data 参数
      console.log("sendFriendMsg msg 参数:", msg); // 打印 msg 参数
      console.log("data msg ", data.msg);
      await this._sendDingDingMsg("friend", data, msg); // 调用统一的消息发送处理方法
      return true; // 返回 true
    }

    async sendGroupMsg(data, msg) {
      console.log("sendGroupMsg data 参数:", data); // 打印 data 参数
      console.log("sendGroupMsg msg 参数:", msg); // 打印 msg 参数
      console.log("data msg ", data.msg);
      await this._sendDingDingMsg("group", data, msg); // 调用统一的消息发送处理方法
      return true; // 返回 true
    }

    async _sendDingDingMsg(type, data, msg) {

       console.log("msg",msg)
      if (!Array.isArray(msg)) msg = [msg];

      for (let i of msg) {
        if (typeof i != "object") i = { type: "text", text: i };

        let file;
        if (i.file) {

          file = await Bot.fileType(i);
          logger.error("sendDingDingMsg - file after Bot.fileType:", file); //  !!! 新增日志 1: 打印 file 对象
          logger.error("sendDingDingMsg - file.buffer instanceof Buffer:", Buffer.isBuffer(file.buffer)); //  !!! 新增日志 2: 检查 file.buffer 是否为 Buffer
          if (Buffer.isBuffer(file.buffer)) {
            file.path = `data/dingding/${file.name}`; // 钉钉适配器文件存储路径
            await fs.writeFile(file.path, file.buffer);
            file.url = `${file.url}\n路径: ${logger.cyan(file.path)}\n网址: ${logger.green(await Bot.fileToUrl(file))}`;
          }
        }

        switch (i.type) {

            case "button":
                continue

          case "text":
            if (i.text.match("\n")) i.text = `发送文本: \n${i.text}`;
            Bot.makeLog("info", `[DingDing ${type}] ${i.text}`, this.id); // 日志前缀区分消息类型 (friend/group)
            break;
          case "image":
            Bot.makeLog(
              "info",
              `[DingDing ${type}] 发送图片: ${file.url}`,
              this.id,
            );
            await sendMarkdownImage(data, file, data.sessionWebhook); // 正确调用方式，并添加 await
            Bot.makeLog("info", Imgurl);
            break;
          case "record":
            Bot.makeLog(
              "info",
              `[DingDing ${type}] 发送音频: ${file.url}`,
              this.id,
            );
            break;
          case "video":
            Bot.makeLog(
              "info",
              `[DingDing ${type}] 发送视频: ${file.url}`,
              this.id,
            );
            break;
          case "file":
            Bot.makeLog(
              "info",
              `[DingDing ${type}] 发送文件: ${file.url}`,
              this.id,
            );
            break;
          case "reply":
          case "at":
            break; //  reply 和 at 消息类型在钉钉适配器中可能没有特殊处理
          case "node":
            await Bot.sendForwardMsg(
              (msg) => this._sendDingDingMsg(type, data, msg),
              i.data,
            ); // 转发消息， 递归调用 _sendDingDingMsg
            break;
          default:
            Bot.makeLog("info", `[DingDing ${type}] 未知消息类型:`, i, this.id); // 记录未知消息类型
        }
      }

      if (type === "friend") {
        //  好友消息发送逻辑
        console.log("_sendDingDingMsg friend 分支 data 参数:", data); // 打印 friend 分支 data 参数
        console.log("_sendDingDingMsg friend 分支 msg 参数:", msg); // 打印 friend 分支 msg 参数
        let textContent = "";
        if (Array.isArray(msg)) {
          for (const segment of msg) {
            if (segment.type === "text") {
              textContent += segment.text; //  修改点：使用 segment.text
            }
          }
        } else if (typeof msg === "string") {
          textContent = msg;
        }

        const textMessagePayload = {
          msgtype: "text",
          text: {
            content: textContent.trim(),
          },
          at: {
            atUserIds: [data?.user_id || ""],
          },
        };
        this._replyMessage(data.sessionWebhook, textMessagePayload);
        return true; // 返回 true
      } else if (type === "group") {
        // 群消息发送逻辑 (目前为空， 需要您根据钉钉群消息 API 实现)

        const textMessagePayload = {
          msgtype: "text",
          text: {
            content: textContent.trim(), //  使用提取到的文本内容，并去除首尾空格
          },
          at: {
            atUserIds: [data?.user_id || ""], //  这里假设 data 中包含 user_id,  可能需要根据实际情况调整 @ 用户的逻辑
          },
        };

        console.log("_sendDingDingMsg group 分支 data 参数:", data); // 打印 group 分支 data 参数
        console.log("_sendDingDingMsg group 分支 msg 参数:", msg); // 打印 group 分支 msg 参数
        let textContent = ""; //  添加：初始化 textContent
        if (Array.isArray(msg)) {
          // 添加：处理数组消息
          for (const segment of msg) {
            if (segment.type === "text") {
              textContent += segment.text;
            }
          }
        } else if (typeof msg === "string") {
          textContent = msg;
        }

        return Promise.resolve({ message_id: Date.now().toString(36) }).then(
          () => true,
        ); //  群消息发送实现， 记得返回 message_id 并且返回 true
      } else {
        Bot.makeLog(
          "warn",
          `[DingDing] 未知消息类型 (friend/group): ${type}`,
          this.id,
        ); // 记录未知的消息类型
        return Promise.reject(new Error(`Unknown message type: ${type}`)); //  返回 rejected Promise
      }
    }

    async makeMsg(data, msg, send) {
      console.log("data msg send", data.msg, send);
    }

    async getFriendArray(data) {
      console.log("data", data);
    }

    async getFriendList(data) {
      console.log("getFriendList data", data);
    }

    async getFriendMap(data) {
      console.log("getFriendMap data", data);
    }

    async getFriendInfo(data) {
      console.log("getFriendInfo data", data);
    }

    async getGroupArray(data) {
      console.log("getGroupArray data", data);
    }

    async getGroupList(data) {
      console.log("getGroupList data", data);
    }

    async getGroupMap(data) {
      console.log("getGroupMap data", data);
    }

    async getGroupInfo(data) {
      console.log("getGroupInfo data", data);
    }

    async getMemberArray(data) {
      console.log("getMemberArray data", data);
    }

    async getMemberList(data) {
      console.log("getMemberList data", data);
    }

    async getMemberMap(data) {
      console.log("getMemberMap data", data);
    }

    async getGroupMemberMap(data) {
      console.log("getGroupMemberMap data", data);
    }

    async getMemberInfo(data) {
      console.log("getMemberInfo data", data);
    }

    pickMember(data, group_id, user_id) {
      console.log("pickMember data", data, group_id, user_id);
    }

    pickGroup(data, group_id) {
      console.log("pickGroup data", data, group_id);
    }

    async connect(data, ws) {
      console.log("connect data", data, ws);
    }

    makeNotice(data) {}

    makeRequest(data) {}

    makeMeta(data, ws) {}

    message(data, ws) {}

    makeMessage(event) {
      console.log("makeMessage 原始 event.data:", event.data.toString()); //  !!! 添加日志： 打印原始 event.data 字符串 (在函数最顶端)

      let data;
      try {
        data = JSON.parse(event.data); // 解析 event.data 获取消息内容
      } catch (e) {
        this.makeLog(`Error parsing message data: ${e}`); // JSON 解析失败的错误处理
        return; // 如果解析失败，直接返回，不继续处理
      }

      if (!data) {
        this.makeLog("Warning: Received empty message data after parsing."); // 解析后 data 为空的警告
        return; // 如果 data 为空，直接返回
      }

      data.message = [
        { type: "text", text: (data?.text?.content || "").trim() },
      ]; // 统一 message 格式，文本消息
      data.raw_message = data.text.content; // 原始消息内容

      //  !!! 正确位置： console.log 移动到 data.message 和 data.raw_message 赋值之后
      console.log("makeMessage data.message:", data.message);
      console.log("makeMessage data.raw_message:", data.raw_message);

      data.post_type = "message"; // 设置 post_type 为 'message'
      data.message_type = data.conversationType === "2" ? "group" : "private"; // 根据 conversationType 判断消息类型 (群聊或私聊)
      data.self_id = this.clientId; // 设置 self_id 为 clientId (机器人自身 ID)
      data.user_id = data.senderId; // 发送者 user_id
      data.sender = {
        user_id: data.senderId,
        nickname: data.senderNick,
        // 可以根据需要添加更多 sender 信息，例如 role, isAdmin 等
      };

      if (data.message_type === "group") {
        data.group_id = data.conversationId; // 群聊时 group_id 为 conversationId
        data.group_name = data.conversationTitle; // 群名称
        Bot.makeLog(
          "info",
          `钉钉群消息：[${data.group_name}, ${data.sender}] ${data.raw_message}`,
          `${data.self_id} <= ${data.group_id}, ${data.user_id}`,
          true,
        );
        Bot.em(`message.dingding.group`, data); // 发射 message.dingding.group 事件
      } else if (data.message_type === "private") {
        Bot.makeLog(
          "info",
          `钉钉私聊消息：[${data.sender.nickname}] ${data.raw_message}`,
          `${data.self_id} <= ${data.user_id}`,
          true,
        );
        Bot.em(`message.dingding.private`, data); // 发射 message.dingding.private 事件
      } else {
        Bot.makeLog(
          "warn",
          `未知钉钉消息类型：${logger.magenta(event.data)}`,
          data.self_id,
        ); // 未知消息类型的警告
        Bot.em(`message.dingding.unknown`, data); // 发射 message.dingding.unknown 事件 (可选)
      }


      //  !!! 修改 data.reply 方法，使其支持消息数组
      data.reply = async (msg) => {
        if (!Array.isArray(msg)) msg = [msg]; // 确保 msg 是数组

        for (let segment of msg) { // 遍历消息数组
          if (typeof segment !== 'object') segment = { type: 'text', text: segment }; // 确保 segment 是对象

          if (segment.type === 'button') { // 忽略按钮类型
            console.log("data.reply 发现按钮对象，已忽略:", segment);
            continue; // 跳过按钮
          }

          if (data.message_type === "private") { // 私聊消息

            if (segment.type === 'text') { // 文本消息
              await sendMsg(segment.text, data.sessionWebhook); // 发送文本消息
            } else if (segment.type === 'image') { // 图片消息
               console.log("data.reply - segment:", segment); //  !!! 打印 segment 对象
              console.log("data.reply - segment.file:", segment.file); //  !!! 打印 segment.file 的值
              console.dir(segment.file, { depth: null }); // 打印 segment.file 对象的完整结构  !!! 添加这一行
segment.file.name = 'image.png';
              await sendMarkdownImage(data, segment.file, data.sessionWebhook, '图片'); // 发送图片消息
            } else { // 其他类型，记录日志 (可选)
              Bot.makeLog("warn", ["data.reply 私聊 -  不支持的消息类型回复", segment.type], data.self_id);
            }
          } else if (data.message_type === "group") { // 群聊消息
            if (segment.type === 'text') { // 文本消息
              await sendMsg(segment.text, data.sessionWebhook); // 发送文本消息
            } else if (segment.type === 'image') { // 图片消息
              await sendMarkdownImage(data, segment.file, data.sessionWebhook, '图片'); // 发送图片消息
            } else { // 其他类型，记录日志 (可选)
              Bot.makeLog("warn", ["data.reply 群聊 - 不支持的消息类型回复", segment.type], data.self_id);
            }
          } else { // 未知消息类型
            Bot.makeLog(
              "warn",
              ["data.reply - 不支持的消息类型回复", data.message_type],
              data.self_id,
            );
          }
        }
        return true; // 返回 true，表示回复尝试完成
      };
    //   // 添加 reply 方法到 data 对象
    //   data.reply = async (msg) => {
    //     if (data.message_type === "private") {
    //       console.log("data.reply - msg parameter type BEFORE sendMarkdownImage:", typeof msg); //  !!! 打印 msg 参数类型
    // console.log("data.reply - msg instanceof Buffer BEFORE sendMarkdownImage:", msg instanceof Buffer); //  !!! 打印 msg 是否为 Buffer 实例
    //
    //       await sendMsg(msg, data.sessionWebhook);
    //       await sendMarkdownImage(data,msg,data.sessionWebhook,'图片')
    //
    //     } else if (data.message_type === "group") {
    //       return sendMsg(msg, data.sessionWebhook);
    //
    //     } else {
    //
    //       Bot.makeLog(
    //         "warn",
    //         ["不支持的消息类型回复", data.message_type],
    //         data.self_id,
    //       );
    //       return false; // 或者抛出异常
    //     }
    //   };
    }

async makeBotImage (file) {
  if (config.toBotUpload) { // 仍然保留 config.toBotUpload 配置项的检查
    for (const i of Bot.uin) { // 遍历 Bot 账号 (可能钉钉只有一个账号，可以简化)
      if (!Bot[i].dingUploadImage) continue //  假设你在 Bot[i] 对象上实现了 dingUploadImage 方法来调用钉钉上传 API
      try {
        const image = await Bot[i].dingUploadImage(file); // 调用钉钉图片上传 API (假设方法名为 dingUploadImage)
        if (image && image.url) { // 检查返回的 image 对象是否包含 url 属性
          return image; // 返回包含图片 URL 的 image 对象
        }
      } catch (err) {
        Bot.makeLog('error', ['Bot', i, '钉钉图片上传错误', file, err]); // 记录钉钉图片上传错误
      }
    }
  }
  return undefined; // 如果所有 Bot 账号上传都失败，返回 undefined
}
async makeMarkdownImage (data, file, summary = '图片') {
  const buffer = await Bot.Buffer(file)
  const image =
    await this.makeBotImage(buffer) ||
    { url: await Bot.fileToUrl(file) }

  if (!image.width || !image.height) {
    try {
      const size = imageSize(buffer)
      image.width = size.width
      image.height = size.height
    } catch (err) {
      Bot.makeLog('error', ['图片分辨率检测错误', file, err], data.self_id)
    }
  }

  image.width = Math.floor(image.width * config.markdownImgScale)
  image.height = Math.floor(image.height * config.markdownImgScale)

  return {
    des: `![<span class="math-inline">\{summary\} \#</span>{image.width || 0}px #${image.height || 0}px]`,
    url: `(${image.url})`
  }
}

    // async _sendDingDingMsg(type, data, msg) {
    //   //  保留函数结构和参数，但简化内部逻辑
    //   let textContent = ""; // 初始化 textContent 变量
    //
    //   if (!Array.isArray(msg)) {
    //     msg = [msg]; //  如果 msg 不是数组，转换为数组统一处理
    //   }
    //
    //   for (let i of msg) {
    //     // if (typeof i != "object") {
    //     //   i = { type: "text", text: i }; // 默认处理为文本消息段
    //     // }
    //     if (i.type === "text") {
    //       textContent += i.text; // 累加文本消息段的内容
    //     }
    //   }
    //
    //   //  !!!  简化后的 _sendDingDingMsg 函数主体： 只进行日志打印，不再构建 payload 和调用 _replyMessage
    //
    //   if (type === "friend") {
    //     //  好友消息类型
    //
    //     Bot.makeLog(
    //       "info",
    //       `[DingDing friend] 模拟发送消息: ${textContent.trim()}  到用户: <span class="math-inline">\{data\.sender\.nickname\}\(</span>{data.user_id})`,
    //       this.id,
    //     ); // 打印模拟发送好友消息日志
    //   } else if (type === "group") {
    //     // 群聊消息类型
    //     Bot.makeLog(
    //       "info",
    //       `[DingDing group] 模拟发送消息: ${textContent.trim()}  到群组: <span class="math-inline">\{data\.group\_name\}\(</span>{data.group_id})`,
    //       this.id,
    //     ); // 打印模拟发送群组消息日志
    //   } else {
    //     //  未知消息类型
    //     Bot.makeLog(
    //       "warn",
    //       `[DingDing] 未知消息类型 (friend/group): ${type}, 模拟发送消息: ${textContent.trim()}`,
    //       this.id,
    //     ); // 打印未知消息类型模拟发送日志
    //   }
    //
    //   return Promise.resolve(true); //  模拟发送成功，直接 resolve Promise 返回 true
    // }
    load() {
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

        let message = JSON.parse(event.data); // 解析 event.data
        let content = (message?.text?.content || "").trim(); // 提取 content 变量

        this.makeMessage(event); // 调用 makeMessage 处理消息, 传入 event 对象


        if (messageId) {
          // 再次检查 messageId 是否存在 (虽然上面已经检查过，但为了代码更严谨，可以再次检查)
          Dingclient.socketCallBackResponse(messageId); // 使用从 headers 中获取的 messageId 发送应答
        }

        return { status: EventAck.SUCCESS, message: "OK" }; // 返回成功应答 (保持不变)
      };

      Dingclient.registerCallbackListener(TOPIC_ROBOT, onBotMessage) // 使用 this.Dingclient 实例
        .connect();
    }
  })(),
);
