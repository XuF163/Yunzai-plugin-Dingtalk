import RootConfig from "../lib/config.js";
import { DWClient, EventAck, TOPIC_ROBOT } from "dingtalk-stream";
import fs from "node:fs/promises"; 
import { sendMarkdownImage, sendMsg } from "../model/sender.js";
import path from "node:path";


class DingDingMultiAccountAdapter {
  constructor() {
    this.id = "DingDing"; 
    this.name = " Adapter "; 
    this.version = `v0.6.5`; 
    this.managedAccounts = new Map(); 
  }


  makeLog(level, accountId, ...args) {
    const instanceName = accountId ? `${accountId}` : this.name;
    let msg = args.map(arg => Bot.String(arg)).join(" ");
    msg = msg.replace(/base64:\/\/.*?([,\]"])/g, "base64://...$1");

    if (typeof level === 'string' && Bot.makeLog) {
      Bot.makeLog(level, msg, instanceName, true);
    } else {
      const time = new Date().toLocaleTimeString();
      logger.info(`[${time}][${level.toUpperCase() || 'INFO'}][${instanceName}] ${msg}`);
    }
  }

  getAccountIdFromSelfId(self_id_in_event) {
    if (typeof self_id_in_event === 'string' && self_id_in_event.startsWith(`${this.id}_`)) {
        return self_id_in_event.substring(this.id.length + 1);
    }
    for (const [accId, accountData] of this.managedAccounts) {
        if (accountData.config.clientId === self_id_in_event || accountData.botGlobalEntryKey === self_id_in_event) {
            return accId;
        }
    }
    this.makeLog("warn", null, `[获取账号ID] 无法从 self_id 解析账号ID: ${self_id_in_event}`);
    return null;
  }

  async sendFriendMsg(data, msg) {
    const accountId = this.getAccountIdFromSelfId(data.self_id);
    if (!accountId) {
        this.makeLog("error", data.self_id, "[发送私聊] 无法确定账号ID。");
        return false;
    }
    this.makeLog("debug", accountId, `[发送私聊] 发送至: ${data.user_id}. Bot: ${data.self_id}. 消息:`, msg);
    return this._sendDingDingMsg("private", data, msg, accountId);
  }

  async sendGroupMsg(data, msg) {
    const accountId = this.getAccountIdFromSelfId(data.self_id);
    if (!accountId) {
        this.makeLog("error", data.self_id, "[发送群聊] 无法确定账号ID。");
        return false;
    }
    this.makeLog("debug", accountId, `[发送群聊] 发送至群: ${data.group_id}. Bot: ${data.self_id}. 消息:`, msg);
    return this._sendDingDingMsg("group", data, msg, accountId);
  }

  async _sendDingDingMsg(type, data, msg, accountId) {
    const sendRequestId = Math.random().toString(36).substring(2, 8);
   // this.makeLog("debug", accountId, `[发送请求:${sendRequestId}] 类型: ${type}, Bot: ${accountId}, 事件 self_id: ${data.self_id}`);

    const accountEntry = this.managedAccounts.get(accountId);
    if (!accountEntry) {
       // this.makeLog("error", accountId, `[发送请求:${sendRequestId}] 账号 ${accountId} 未找到。`);
        return false;
    }
   //this.makeLog("debug", accountId, `[发送请求:${sendRequestId}] 消息:`, msg);
    if (!Array.isArray(msg)) msg = [msg];

    let combinedText = [];
    let hasNonTextContentSuccessfullySent = false;

    for (const segment of msg) {
      let currentSegment = segment;
      if (typeof currentSegment !== "object") {
        currentSegment = { type: "text", text: String(currentSegment) };
      }

      if (currentSegment.type === "button") {
     //   this.makeLog("debug", accountId, `[发送请求:${sendRequestId}] 忽略按钮段:`, currentSegment);
        continue;
      }

      let fileInfo = null;
      if (currentSegment.file) {
        try {
          fileInfo = await Bot.fileType({ file: currentSegment.file, name: currentSegment.name });
       //   this.makeLog("debug", accountId, `[发送请求:${sendRequestId}] Bot.fileType 结果:`, fileInfo);
          if (!(fileInfo?.buffer instanceof Buffer)) {
       //     this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] Bot.fileType 返回无效 Buffer:`, fileInfo);
            fileInfo = null;
          } else {
      //      this.makeLog("info", accountId, `[发送请求:${sendRequestId}] 获取到 Buffer (名称: ${fileInfo.name}, 大小: ${fileInfo.buffer.length} 字节)`);
          }
        } catch (error) {
       //   this.makeLog("error", accountId, `[发送请求:${sendRequestId}] Bot.fileType 错误:`, error);
          fileInfo = null;
        }
      }

      switch (currentSegment.type) {
        case "text":
          combinedText.push(currentSegment.text);
          break;
        case "image":
          if (fileInfo && fileInfo.buffer instanceof Buffer && data.sessionWebhook) {
          //  this.makeLog("info", accountId, `[发送请求:${sendRequestId}] 发送图片 (原名称: ${fileInfo.name})`);
            try {
              const imageSendResponse = await sendMarkdownImage(data, fileInfo, data.sessionWebhook, currentSegment.summary || '图片');
              if (imageSendResponse && imageSendResponse.status === EventAck.SUCCESS) {
                hasNonTextContentSuccessfullySent = true;
            //    this.makeLog("info", accountId, `[发送请求:${sendRequestId}] Markdown 图片发送成功。响应:`, imageSendResponse.response);
              } else {
            //    this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] Markdown 图片发送失败。详情:`, imageSendResponse);
                if (currentSegment.text) combinedText.push(currentSegment.text);
              }
            } catch (error) {
               this.makeLog("error", accountId, `[发送请求:${sendRequestId}] 调用 sendMarkdownImage 异常: `, error);
               if (currentSegment.text) combinedText.push(currentSegment.text);
            }
          } else {
            this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] 图片 Buffer 无效或 sessionWebhook 缺失。fileInfo:`, fileInfo, `sessionWebhook:`, data.sessionWebhook);
            if (currentSegment.text) combinedText.push(currentSegment.text);
          }
          break;
        case "record":
        case "video":
        case "file":
          if (fileInfo?.buffer) {
            const fallbackText = `[${currentSegment.type} 文件: ${fileInfo.name || '未知文件'} (暂未支持直接发送)]`;
            combinedText.push(fallbackText);
            this.makeLog("info", accountId, `[发送请求:${sendRequestId}] ${currentSegment.type} 回退: ${fallbackText}`);
            hasNonTextContentSuccessfullySent = true;
          } else {
            this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] ${currentSegment.type} 信息不完整`, currentSegment);
            if (currentSegment.text) combinedText.push(currentSegment.text);
          }
          break;
        case "reply":
          if (data.user_id) combinedText.push(`@${data.user_id} `);
          if (currentSegment.text) combinedText.push(currentSegment.text);
          break;
        case "at":
          if (currentSegment.qq === "all") combinedText.push("@所有人 ");
          else combinedText.push(`@${currentSegment.qq} `);
          if (currentSegment.text) combinedText.push(currentSegment.text);
          break;
        case "node":
          await Bot.sendForwardMsg(
            (forwardMsg) => this._sendDingDingMsg(type, data, forwardMsg, accountId),
            currentSegment.data
          );
          hasNonTextContentSuccessfullySent = true;
          break;
        default:
          this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] 未知消息段类型:`, currentSegment);
          if (currentSegment.text) combinedText.push(currentSegment.text);
      }
    }

    const textContent = combinedText.join("\n").trim();
    let textSentSuccessfully = false;

    if (textContent) {
        const webhookToSend = data.sessionWebhook || accountEntry.config.webhook;
        if (!webhookToSend) {
            this.makeLog("error", accountId, `[发送请求:${sendRequestId}] Webhook 未定义。无法发送文本。`);
        } else {
         //   this.makeLog("debug", accountId, `[发送请求:${sendRequestId}] 发送 ${type} 文本 (通过 sendMsg) 到 webhook: ${webhookToSend.split("?")[0]}... 内容: ${textContent.substring(0,50)}...`);
            try {
                // Pass original event `data` (which is `e` from makeMessage) as eventContext to sendMsg
                const sendResult = await sendMsg(textContent, webhookToSend, data);
                if (sendResult && sendResult.status === EventAck.SUCCESS) {
                    textSentSuccessfully = true;
              //      this.makeLog("info", accountId, `[发送请求:${sendRequestId}] 文本 (Markdown) 通过 sendMsg 发送成功。`);
                } else {
                     this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] sendMsg 返回非 SUCCESS。详情:`, sendResult);
                }
            } catch (error) {
                this.makeLog("error", accountId, `[发送请求:${sendRequestId}] 调用 sendMsg 错误:`, error);
            }
        }
    }

    if (textSentSuccessfully || hasNonTextContentSuccessfullySent) {
    //  this.makeLog("info", accountId, `[发送请求:${sendRequestId}] 操作成功 (文本: ${textSentSuccessfully}, 非文本: ${hasNonTextContentSuccessfullySent})。`);
      return { message_id: `${accountEntry.botGlobalEntryKey}_${sendRequestId}` };
    } else {
      this.makeLog("warn", accountId, `[发送请求:${sendRequestId}] 没有内容成功发送。`);
      return false;
    }
  }

  // This method is kept for direct payload sending if ever needed, but sendMsg/sendMarkdownImage are preferred.
  async _replyMessage(accountId, webhook, payload) {
    this.makeLog('debug', accountId, '[_replyMessage] 尝试发送 payload:', payload, '到 webhook:', webhook ? webhook.split("?")[0] : "UNDEFINED");
    if (!webhook) { this.makeLog('error', accountId, '[_replyMessage] Webhook URL 未定义。'); return false; }
    try {
      const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const responseText = await response.text();
      this.makeLog('debug', accountId, `[_replyMessage] HTTP 状态: ${response.status}. 原始响应: ${responseText.substring(0,100)}`);
      if (response.ok) {
        const responseData = JSON.parse(responseText);
        if (responseData.errcode === 0) { this.makeLog('debug', accountId, '[_replyMessage] 成功 (已废弃路径)。'); return true; }
        else { this.makeLog('error', accountId, '[_replyMessage] 失败 (已废弃路径)。钉钉错误:', responseData); return false; }
      } else { this.makeLog('error', accountId, `[_replyMessage] HTTP 错误 (已废弃路径): ${response.status}`); return false; }
    } catch (error) { this.makeLog('error', accountId, '[_replyMessage] 请求异常 (已废弃路径):', error); return false; }
  }

  makeMessage(event, accountId, accountConfig) {
    const botGlobalEntryKey = `${this.id}_${accountId}`;
    const rawDataString = event.data.toString();
    this.makeLog("debug", accountId, `[构建消息] ${botGlobalEntryKey} 的原始事件: ${rawDataString.substring(0,100)}...`);
    
    let parsedData;
    try { parsedData = JSON.parse(rawDataString); }
    catch (e) { this.makeLog("error", accountId, `[构建消息] JSON 解析错误: ${e}. 原始数据: ${rawDataString}`); return; }

    if (!parsedData) { this.makeLog("warn", accountId, "[构建消息] 解析数据为空。"); return; }
    
    const e = {
      post_type: "message",
      message_type: parsedData.conversationType === "2" ? "group" : "private",
      self_id: botGlobalEntryKey,
      user_id: parsedData.senderStaffId || parsedData.senderId,
      sender: {
        user_id: parsedData.senderStaffId || parsedData.senderId,
        nickname: parsedData.senderNick || "未知用户",
        senderCorpId: parsedData.senderCorpId,
        isAdmin: parsedData.isAdmin,
        isBoss: parsedData.isBoss,
      },
      raw_message: (parsedData.text?.content || "").trim(),
      message: [{ type: "text", text: (parsedData.text?.content || "").trim() }],
      sessionWebhook: parsedData.sessionWebhook,
      conversationId: parsedData.conversationId,
      message_id: parsedData.msgId || event.headers?.messageId || `${botGlobalEntryKey}_${Date.now()}`,
      adapter_id: this.id,
      adapter_name: this.name,
      time: parsedData.createAt ? Math.floor(parsedData.createAt / 1000) : Math.floor(Date.now() / 1000),
      adapter: { id: this.id, name: this.name, version: this.version },
      dingtalk_event: parsedData, 
    };

    if (e.message_type === "group") {
      e.group_id = parsedData.conversationId;
      e.group_name = parsedData.conversationTitle || "未知群聊";
      if (Array.isArray(parsedData.atUsers)) {
          e.atme = parsedData.atUsers.some(atUser => atUser.dingtalkId === parsedData.chatbotUserId);
      }
      this.makeLog("info", accountId, `[构建消息] 群消息来自 ${e.group_name}(GID:${e.group_id.substring(0,10)}...) 由 ${e.sender.nickname}(UID:${e.user_id.substring(e.user_id.length-10)}) 发送: ${e.raw_message.substring(0,30)}... @我: ${e.atme}`);
      Bot.em(`message.group`, e);
    } else if (e.message_type === "private") {
      this.makeLog("info", accountId, `[构建消息] 私聊消息来自 ${e.sender.nickname}(UID:${e.user_id.substring(e.user_id.length-10)}): ${e.raw_message.substring(0,30)}...`);
      Bot.em(`message.private`, e);
    } else {
        this.makeLog("warn", accountId, `[构建消息] 未知消息类型: ${parsedData.conversationType}`);
        Bot.em(`message.dingding.unknown.${botGlobalEntryKey}`, e);
    }

    e.reply = async (msg, quote = false) => {
      const replyReqId = Math.random().toString(36).substring(2, 8);
      //this.makeLog("debug", accountId, `[回复请求:${replyReqId}] Bot: ${accountId}, 原始类型: ${e.message_type}, SessionWebhook: ${e.sessionWebhook ? e.sessionWebhook.split("?")[0] : 'N/A'}, 回复内容:`, msg);
      if (e.message_type === "private") {
        return this.sendFriendMsg(e, msg);
      } else if (e.message_type === "group") {
        return this.sendGroupMsg(e, msg);
      }
      this.makeLog("warn", accountId, `[回复请求:${replyReqId}] 未知回复消息类型:`, e.message_type);
      return false;
    };
  }

  async getBotInfo(accountConfig) {
    return {
      nick: accountConfig.botName || `DingDingBot (${accountConfig.accountId})`,
      avatarUrl: accountConfig.botAvatar || "https://img.kookapp.cn/assets/default_avatar.png",
    };
  }

  async load() {
  //  this.makeLog("info", null, ` ${this.name} ${this.version} 正在初始化...`);
    const accountsToLoad = RootConfig.dingdingAccounts;

    if (RootConfig.enableDingAdapter === false) {
        this.makeLog("warn", null, "[加载] 适配器已通过 RootConfig.enableDingAdapter=false 禁用。");
        return false;
    }

    if (!Array.isArray(accountsToLoad) || accountsToLoad.length === 0) {
      this.makeLog("warn", null, "[加载] RootConfig.dingdingAccounts 中没有钉钉账号。");
      return true;
    }

    let loadedAccountCount = 0;
    for (const accountConfig of accountsToLoad) {
      const accountId = accountConfig.accountId;
      if (!accountId || !accountConfig.clientId || !accountConfig.clientSecret) {
        this.makeLog("error", accountId || "UnknownAccount", "[加载] 无效的账号配置 (缺少 accountId, clientId, 或 clientSecret)。跳过。", accountConfig);
        continue;
      }

      //this.makeLog("info", accountId, `[加载] 正在初始化账号: ${accountId} (ClientID: ${accountConfig.clientId.substring(0,10)}...)`);
      
      const currentDwClient = new DWClient({
        clientId: accountConfig.clientId,
        clientSecret: accountConfig.clientSecret,
        debug: accountConfig.debug !== undefined ? accountConfig.debug : (RootConfig.debugGlobal || false),
        keepAlive: accountConfig.keepAlive !== undefined ? accountConfig.keepAlive : true, 
        autoReconnect: accountConfig.autoReconnect !== undefined ? accountConfig.autoReconnect : true,
      });

      const botGlobalEntryKey = `${this.id}_${accountId}`;
      
      this.managedAccounts.set(accountId, {
        config: accountConfig,
        dwClient: currentDwClient,
        botGlobalEntryKey: botGlobalEntryKey
      });

      const onBotMessageForThisAccount = async (event) => {
        const streamMessageId = event.headers?.messageId;
        const rawData = event.data.toString();
        const logPrefix = `[机器人消息][账号:${accountId}][流:${streamMessageId ? streamMessageId.slice(-6) : 'N/A'}]`;
        this.makeLog("debug", accountId, `${logPrefix} 收到。数据: ${rawData.substring(0,50)}...`);

        let ackPayloadData = { status: "SUCCESS", message: "由 Yunzai 适配器处理 (默认)" };

        if (!streamMessageId) {
          this.makeLog("warn", accountId, `${logPrefix} 流 messageId (headers.messageId) 缺失! 无法 ACK。数据:`, rawData);
        }

        try {
            this.makeLog("debug", accountId, `${logPrefix} 调用 makeMessage。`);
            this.makeMessage(event, accountId, accountConfig);
            //this.makeLog("info", accountId, `${logPrefix} makeMessage 完成。发送 SUCCESS ACK。`);
            ackPayloadData.message = "由 makeMessage 成功处理";
        } catch (e) {
            this.makeLog("error", accountId, `${logPrefix} makeMessage 错误。错误: ${e.stack || e}`);
            ackPayloadData = { status: "FAILURE", message: `适配器处理错误: ${e.message}` };
        } finally {
            if (streamMessageId) {
               // this.makeLog("debug", accountId, `${logPrefix} 发送 ACK 数据:`, ackPayloadData);
                currentDwClient.socketCallBackResponse(streamMessageId, ackPayloadData);
            }
        }
      };

      try {
       // this.makeLog("info", accountId, `[加载] 正在为 ${accountId} 注册流回调...`);
        // 使用 registerCallbackListener 来确保订阅被正确添加
        currentDwClient.registerCallbackListener(TOPIC_ROBOT, onBotMessageForThisAccount);
        
       // this.makeLog("info", accountId, `[加载] 正在为 ${accountId} 连接流...`);
        await currentDwClient.connect();
       // this.makeLog("info", accountId, `[加载] ${accountId} 的流已连接。`);

        if (!Bot[botGlobalEntryKey]) {
          const botInfo = await this.getBotInfo(accountConfig);
          Bot[botGlobalEntryKey] = {
            adapter: this,
            info: botInfo,
            uin: accountConfig.clientId,
            nickname: botInfo.nick,
            avatar: botInfo.avatarUrl,
            version: { id: botGlobalEntryKey, name: botInfo.nick, version: this.version },
            stat: { start_time: Math.floor(Date.now() / 1000) },
            
            pickFriend: (user_id) => {
                this.makeLog('debug', accountId, `[Bot.${botGlobalEntryKey}.选择好友](${user_id})`);
                const context = { user_id, self_id: botGlobalEntryKey, _accountConfig: accountConfig };
                return {
                    id: user_id, uin: user_id, self_id: botGlobalEntryKey,
                    sendMsg: (msg, quote=false) => this._sendDingDingMsg("private", context, msg, accountId)
                };
            },
            get pickUser() { return Bot[botGlobalEntryKey].pickFriend; },
            pickGroup: (group_id) => {
                this.makeLog('debug', accountId, `[Bot.${botGlobalEntryKey}.选择群聊](${group_id})`);
                const context = { group_id, self_id: botGlobalEntryKey, _accountConfig: accountConfig };
                return {
                    id: group_id, uin: group_id, self_id: botGlobalEntryKey,
                    sendMsg: (msg, quote=false) => this._sendDingDingMsg("group", context, msg, accountId),
                    pickMember: (user_id) => Bot[botGlobalEntryKey].pickMember(group_id, user_id)
                };
            },
            pickMember: (group_id, user_id) => {
                 this.makeLog('debug', accountId, `[Bot.${botGlobalEntryKey}.选择成员](${group_id}, ${user_id})`);
                 const context = { group_id, user_id, self_id: botGlobalEntryKey, _accountConfig: accountConfig };
                 return {
                    id: user_id, uin: user_id, group_id, self_id: botGlobalEntryKey,
                    sendMsg: (msg, quote=false) => this._sendDingDingMsg("group", context, msg, accountId)
                 };
            },
            getFriendList: async () => { this.makeLog('warn', accountId, `[Bot.${botGlobalEntryKey}.获取好友列表] 未实现。`); return new Map(); },
            getGroupList: async () => { this.makeLog('warn', accountId, `[Bot.${botGlobalEntryKey}.获取群列表] 未实现。`); return new Map(); },
            fl: new Map(), gl: new Map(), gml: new Map(),
          };
          if (Bot.bots && typeof Bot.bots === 'object') {
              Bot.bots[botGlobalEntryKey] = Bot[botGlobalEntryKey];
          }
          this.makeLog("mark", accountId, `钉钉机器人${botGlobalEntryKey} ( ${botInfo.nick}) 已连接`);
          Bot.em(`connect.${botGlobalEntryKey}`, { self_id: botGlobalEntryKey });
          loadedAccountCount++;
        } else {
            this.makeLog("warn", accountId, `Bot 条目 ${botGlobalEntryKey} 已存在。`);
        }
      } catch (error) {
        this.makeLog("error", accountId, `[钉钉账号异常] 连接或加载账号 ${accountId} 失败:`, error);
      }
    }

    if (loadedAccountCount > 0) {
        this.makeLog("mark", null, `钉钉已初始化 ${loadedAccountCount} 个账号`);
        return true;
    } else {
        this.makeLog("warn", null, `${this.name} 未加载任何账号 (或全部失败)。请确保 dingdingAccounts 已配置且 enableDingAdapter 为 true。`);
        return true; 
    }
  }
} // End of DingDingMultiAccountAdapter class

const dingAdapterInstance = new DingDingMultiAccountAdapter();
Bot.adapter.push(dingAdapterInstance);