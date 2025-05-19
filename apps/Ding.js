// Ding.js (适配器主逻辑文件 - 多账号版本 v0.6.5 - 无应用层去重, 修正回调注册)

import RootConfig from "../lib/config.js"; // 导入根配置对象，它包含了所有配置
import { DWClient, EventAck, TOPIC_ROBOT } from "dingtalk-stream";
import fs from "node:fs/promises"; // 保留，Bot.fileType 内部可能使用
import { sendMarkdownImage, sendMsg } from "../model/sender.js";
import path from "node:path"; // 保留，路径操作可能需要

// DingDingMultiAccountAdapter 类定义
class DingDingMultiAccountAdapter {
  constructor() {
    this.id = "DingDing"; // 主适配器的固定ID (Yunzai识别适配器类型用)
    this.name = "DingDing Multi-Account Adapter"; // 主适配器的名称
    this.version = `v0.6.5`; // 版本迭代
    this.logger = Bot.logger; // 全局logger
    this.managedAccounts = new Map(); // K: accountId (e.g., "bot1"), V: { config, dwClient, botGlobalEntryKey }
  }

  // 日志函数，第一个参数是accountId，用于区分日志来源
  makeLog(level, accountId, ...args) {
    const instanceName = accountId ? `DingDing_${accountId}` : this.name;
    let msg = args.map(arg => Bot.String(arg)).join(" ");
    msg = msg.replace(/base64:\/\/.*?([,\]"])/g, "base64://...$1");

    if (typeof level === 'string' && this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[${instanceName}] ${msg}`);
    } else if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(`[${instanceName}] ${msg}`);
    } else {
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}][${level.toUpperCase() || 'INFO'}][${instanceName}] ${msg}`);
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
    this.makeLog("warn", null, `[getAccountIdFromSelfId] Cannot parse accountId from self_id: ${self_id_in_event}`);
    return null;
  }

  async sendFriendMsg(data, msg) {
    const accountId = this.getAccountIdFromSelfId(data.self_id);
    if (!accountId) {
        this.makeLog("error", data.self_id, "[sendFriendMsg] Could not determine accountId.");
        return false;
    }
    this.makeLog("debug", accountId, `[sendFriendMsg] To: ${data.user_id}. Bot: ${data.self_id}. Msg:`, msg);
    return this._sendDingDingMsg("private", data, msg, accountId);
  }

  async sendGroupMsg(data, msg) {
    const accountId = this.getAccountIdFromSelfId(data.self_id);
    if (!accountId) {
        this.makeLog("error", data.self_id, "[sendGroupMsg] Could not determine accountId.");
        return false;
    }
    this.makeLog("debug", accountId, `[sendGroupMsg] To Group: ${data.group_id}. Bot: ${data.self_id}. Msg:`, msg);
    return this._sendDingDingMsg("group", data, msg, accountId);
  }

  async _sendDingDingMsg(type, data, msg, accountId) {
    const sendRequestId = Math.random().toString(36).substring(2, 8);
    this.makeLog("debug", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Type: ${type}, For bot: ${accountId}, Event self_id: ${data.self_id}`);

    const accountEntry = this.managedAccounts.get(accountId);
    if (!accountEntry) {
        this.makeLog("error", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Account ${accountId} not found.`);
        return false;
    }
    this.makeLog("debug", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Incoming msg:`, msg);
    if (!Array.isArray(msg)) msg = [msg];

    let combinedText = [];
    let hasNonTextContentSuccessfullySent = false;

    for (const segment of msg) {
      let currentSegment = segment;
      if (typeof currentSegment !== "object") {
        currentSegment = { type: "text", text: String(currentSegment) };
      }

      if (currentSegment.type === "button") {
        this.makeLog("debug", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Ignoring button segment:`, currentSegment);
        continue;
      }

      let fileInfo = null;
      if (currentSegment.file) {
        try {
          fileInfo = await Bot.fileType({ file: currentSegment.file, name: currentSegment.name });
          this.makeLog("debug", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Bot.fileType result:`, fileInfo);
          if (!(fileInfo?.buffer instanceof Buffer)) {
            this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Invalid Buffer from Bot.fileType:`, fileInfo);
            fileInfo = null;
          } else {
            this.makeLog("info", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Buffer obtained (name: ${fileInfo.name}, size: ${fileInfo.buffer.length} bytes)`);
          }
        } catch (error) {
          this.makeLog("error", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Bot.fileType Error:`, error);
          fileInfo = null;
        }
      }

      switch (currentSegment.type) {
        case "text":
          combinedText.push(currentSegment.text);
          break;
        case "image":
          if (fileInfo && fileInfo.buffer instanceof Buffer && data.sessionWebhook) {
            this.makeLog("info", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Sending image (original name: ${fileInfo.name})`);
            try {
              const imageSendResponse = await sendMarkdownImage(data, fileInfo, data.sessionWebhook, currentSegment.summary || '图片');
              if (imageSendResponse && imageSendResponse.status === EventAck.SUCCESS) {
                hasNonTextContentSuccessfullySent = true;
                this.makeLog("info", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Markdown image sent successfully. Response:`, imageSendResponse.response);
              } else {
                this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Markdown image send failed. Details:`, imageSendResponse);
                if (currentSegment.text) combinedText.push(currentSegment.text);
              }
            } catch (error) {
               this.makeLog("error", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Exception calling sendMarkdownImage: `, error);
               if (currentSegment.text) combinedText.push(currentSegment.text);
            }
          } else {
            this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Image buffer invalid or sessionWebhook missing. fileInfo:`, fileInfo, `sessionWebhook:`, data.sessionWebhook);
            if (currentSegment.text) combinedText.push(currentSegment.text);
          }
          break;
        case "record":
        case "video":
        case "file":
          if (fileInfo?.buffer) {
            const fallbackText = `[${currentSegment.type} 文件: ${fileInfo.name || '未知文件'} (暂未支持直接发送)]`;
            combinedText.push(fallbackText);
            this.makeLog("info", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Fallback for ${currentSegment.type}: ${fallbackText}`);
            hasNonTextContentSuccessfullySent = true;
          } else {
            this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] ${currentSegment.type} info incomplete`, currentSegment);
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
          this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Unknown segment type:`, currentSegment);
          if (currentSegment.text) combinedText.push(currentSegment.text);
      }
    }

    const textContent = combinedText.join("\n").trim();
    let textSentSuccessfully = false;

    if (textContent) {
        const webhookToSend = data.sessionWebhook || accountEntry.config.webhook;
        if (!webhookToSend) {
            this.makeLog("error", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Webhook undefined. Cannot send text.`);
        } else {
            this.makeLog("debug", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Sending ${type} text (via sendMsg) to webhook: ${webhookToSend.split("?")[0]}... Content: ${textContent.substring(0,50)}...`);
            try {
                // Pass original event `data` (which is `e` from makeMessage) as eventContext to sendMsg
                const sendResult = await sendMsg(textContent, webhookToSend, data);
                if (sendResult && sendResult.status === EventAck.SUCCESS) {
                    textSentSuccessfully = true;
                    this.makeLog("info", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Text (Markdown) sent successfully via sendMsg.`);
                } else {
                     this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] sendMsg returned non-SUCCESS. Details:`, sendResult);
                }
            } catch (error) {
                this.makeLog("error", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Error calling sendMsg:`, error);
            }
        }
    }

    if (textSentSuccessfully || hasNonTextContentSuccessfullySent) {
      this.makeLog("info", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] Operation successful (text: ${textSentSuccessfully}, non-text: ${hasNonTextContentSuccessfullySent}).`);
      return { message_id: `${accountEntry.botGlobalEntryKey}_${sendRequestId}` };
    } else {
      this.makeLog("warn", accountId, `[SEND_REQ:${sendRequestId}] [_sendDingDingMsg] No content successfully sent.`);
      return false;
    }
  }

  // This method is kept for direct payload sending if ever needed, but sendMsg/sendMarkdownImage are preferred.
  async _replyMessage(accountId, webhook, payload) {
    this.makeLog('debug', accountId, '[_replyMessage] Attempting to send payload:', payload, 'to webhook:', webhook ? webhook.split("?")[0] : "UNDEFINED");
    if (!webhook) { this.makeLog('error', accountId, '[_replyMessage] Webhook URL undefined.'); return false; }
    try {
      const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const responseText = await response.text();
      this.makeLog('debug', accountId, `[_replyMessage] HTTP Status: ${response.status}. Raw Resp: ${responseText.substring(0,100)}`);
      if (response.ok) {
        const responseData = JSON.parse(responseText);
        if (responseData.errcode === 0) { this.makeLog('debug', accountId, '[_replyMessage] Success (deprecated path).'); return true; }
        else { this.makeLog('error', accountId, '[_replyMessage] Failed (deprecated path). DingTalk Error:', responseData); return false; }
      } else { this.makeLog('error', accountId, `[_replyMessage] HTTP Error (deprecated path): ${response.status}`); return false; }
    } catch (error) { this.makeLog('error', accountId, '[_replyMessage] Request exception (deprecated path):', error); return false; }
  }

  makeMessage(event, accountId, accountConfig) {
    const botGlobalEntryKey = `${this.id}_${accountId}`;
    const rawDataString = event.data.toString();
    this.makeLog("debug", accountId, `[makeMessage] Raw event for ${botGlobalEntryKey}: ${rawDataString.substring(0,100)}...`);
    
    let parsedData;
    try { parsedData = JSON.parse(rawDataString); }
    catch (e) { this.makeLog("error", accountId, `[makeMessage] JSON parse error: ${e}. Raw: ${rawDataString}`); return; }

    if (!parsedData) { this.makeLog("warn", accountId, "[makeMessage] Parsed data empty."); return; }
    
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
      this.makeLog("info", accountId, `[makeMessage] Group Msg from ${e.group_name}(GID:${e.group_id.substring(0,10)}...) by ${e.sender.nickname}(UID:${e.user_id.substring(e.user_id.length-10)}): ${e.raw_message.substring(0,30)}... AtMe: ${e.atme}`);
      Bot.em(`message.group`, e);
    } else if (e.message_type === "private") {
      this.makeLog("info", accountId, `[makeMessage] Private Msg from ${e.sender.nickname}(UID:${e.user_id.substring(e.user_id.length-10)}): ${e.raw_message.substring(0,30)}...`);
      Bot.em(`message.private`, e);
    } else {
        this.makeLog("warn", accountId, `[makeMessage] Unknown msg type: ${parsedData.conversationType}`);
        Bot.em(`message.dingding.unknown.${botGlobalEntryKey}`, e);
    }

    e.reply = async (msg, quote = false) => {
      const replyReqId = Math.random().toString(36).substring(2, 8);
      this.makeLog("debug", accountId, `[e.reply REQ:${replyReqId}] Bot: ${accountId}, Original type: ${e.message_type}, SessionWebhook: ${e.sessionWebhook ? e.sessionWebhook.split("?")[0] : 'N/A'}, Reply content:`, msg);
      if (e.message_type === "private") {
        return this.sendFriendMsg(e, msg);
      } else if (e.message_type === "group") {
        return this.sendGroupMsg(e, msg);
      }
      this.makeLog("warn", accountId, `[e.reply REQ:${replyReqId}] Unknown message type for reply:`, e.message_type);
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
    this.makeLog("info", null, `[load] ${this.name} ${this.version} initializing...`);
    const accountsToLoad = RootConfig.dingdingAccounts;

    if (RootConfig.enableDingAdapter === false) {
        this.makeLog("warn", null, "[load] Adapter disabled by RootConfig.enableDingAdapter=false.");
        return false;
    }

    if (!Array.isArray(accountsToLoad) || accountsToLoad.length === 0) {
      this.makeLog("warn", null, "[load] No DingTalk accounts in RootConfig.dingdingAccounts.");
      return true;
    }

    let loadedAccountCount = 0;
    for (const accountConfig of accountsToLoad) {
      const accountId = accountConfig.accountId;
      if (!accountId || !accountConfig.clientId || !accountConfig.clientSecret) {
        this.makeLog("error", accountId || "UnknownAccount", "[load] Invalid account config (missing accountId, clientId, or clientSecret). Skipping.", accountConfig);
        continue;
      }

      this.makeLog("info", accountId, `[load] Initializing account: ${accountId} (ClientID: ${accountConfig.clientId.substring(0,10)}...)`);
      
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
        const logPrefix = `[onBotMessage][Acc:${accountId}][Stream:${streamMessageId ? streamMessageId.slice(-6) : 'N/A'}]`;
        this.makeLog("debug", accountId, `${logPrefix} Received. Data: ${rawData.substring(0,50)}...`);

        let ackPayloadData = { status: "SUCCESS", message: "Processed by Yunzai Adapter (default)" }; 

        if (!streamMessageId) {
          this.makeLog("warn", accountId, `${logPrefix} Stream messageId (headers.messageId) missing! Cannot ACK. Data:`, rawData);
        }

        try {
            this.makeLog("debug", accountId, `${logPrefix} Calling makeMessage.`);
            this.makeMessage(event, accountId, accountConfig);
            this.makeLog("info", accountId, `${logPrefix} makeMessage completed. Sending SUCCESS ACK.`);
            ackPayloadData.message = "Successfully processed by makeMessage";
        } catch (e) {
            this.makeLog("error", accountId, `${logPrefix} Error in makeMessage. Error: ${e.stack || e}`);
            ackPayloadData = { status: "FAILURE", message: `Adapter processing error: ${e.message}` };
        } finally {
            if (streamMessageId) {
                this.makeLog("debug", accountId, `${logPrefix} Sending ACK with data:`, ackPayloadData);
                currentDwClient.socketCallBackResponse(streamMessageId, ackPayloadData);
            }
        }
      };

      try {
        this.makeLog("info", accountId, `[load] Registering Stream callback for ${accountId}...`);
        // 使用 registerCallbackListener 来确保订阅被正确添加
        currentDwClient.registerCallbackListener(TOPIC_ROBOT, onBotMessageForThisAccount);
        
        this.makeLog("info", accountId, `[load] Connecting Stream for ${accountId}...`);
        await currentDwClient.connect();
        this.makeLog("info", accountId, `[load] Stream connected for ${accountId}.`);

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
                this.makeLog('debug', accountId, `[Bot.${botGlobalEntryKey}.pickFriend](${user_id})`);
                const context = { user_id, self_id: botGlobalEntryKey, _accountConfig: accountConfig };
                return {
                    id: user_id, uin: user_id, self_id: botGlobalEntryKey,
                    sendMsg: (msg, quote=false) => this._sendDingDingMsg("private", context, msg, accountId)
                };
            },
            get pickUser() { return Bot[botGlobalEntryKey].pickFriend; },
            pickGroup: (group_id) => {
                this.makeLog('debug', accountId, `[Bot.${botGlobalEntryKey}.pickGroup](${group_id})`);
                const context = { group_id, self_id: botGlobalEntryKey, _accountConfig: accountConfig };
                return {
                    id: group_id, uin: group_id, self_id: botGlobalEntryKey,
                    sendMsg: (msg, quote=false) => this._sendDingDingMsg("group", context, msg, accountId),
                    pickMember: (user_id) => Bot[botGlobalEntryKey].pickMember(group_id, user_id)
                };
            },
            pickMember: (group_id, user_id) => {
                 this.makeLog('debug', accountId, `[Bot.${botGlobalEntryKey}.pickMember](${group_id}, ${user_id})`);
                 const context = { group_id, user_id, self_id: botGlobalEntryKey, _accountConfig: accountConfig };
                 return {
                    id: user_id, uin: user_id, group_id, self_id: botGlobalEntryKey,
                    sendMsg: (msg, quote=false) => this._sendDingDingMsg("group", context, msg, accountId)
                 };
            },
            getFriendList: async () => { this.makeLog('warn', accountId, `[Bot.${botGlobalEntryKey}.getFriendList] Not implemented.`); return new Map(); },
            getGroupList: async () => { this.makeLog('warn', accountId, `[Bot.${botGlobalEntryKey}.getGroupList] Not implemented.`); return new Map(); },
            fl: new Map(), gl: new Map(), gml: new Map(),
          };
          if (Bot.bots && typeof Bot.bots === 'object') {
              Bot.bots[botGlobalEntryKey] = Bot[botGlobalEntryKey];
          }
          this.makeLog("mark", accountId, `Bot entry ${botGlobalEntryKey} (Name: ${botInfo.nick}) created and connected.`);
          Bot.em(`connect.${botGlobalEntryKey}`, { self_id: botGlobalEntryKey });
          loadedAccountCount++;
        } else {
            this.makeLog("warn", accountId, `Bot entry ${botGlobalEntryKey} already exists.`);
        }
      } catch (error) {
        this.makeLog("error", accountId, `[load] Failed to connect or load account ${accountId}:`, error);
      }
    }

    if (loadedAccountCount > 0) {
        this.makeLog("mark", null, `${this.name} initialized with ${loadedAccountCount} account(s).`);
        return true;
    } else {
        this.makeLog("warn", null, `${this.name} did not load any accounts (or all failed). Ensure dingdingAccounts is configured and enableDingAdapter is true.`);
        return true; 
    }
  }
} // End of DingDingMultiAccountAdapter class

const dingAdapterInstance = new DingDingMultiAccountAdapter();
Bot.adapter.push(dingAdapterInstance);