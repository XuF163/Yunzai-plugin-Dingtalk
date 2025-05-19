// panupload.js
import RootConfig from "../lib/config.js"; // 根配置，包含所有账户
import imageSize from "image-size";

class DingTalkImageUploader {
    // constructor 不再直接存 Config，因为配置是每个账号不同的

    // 辅助函数，从 RootConfig.dingdingAccounts 中获取指定accountId的配置
    _getAccountConfig(accountId) {
        if (!accountId || !Array.isArray(RootConfig.dingdingAccounts)) {
            return RootConfig; // 返回全局配置作为回退（或者 null/undefined）
        }
        const account = RootConfig.dingdingAccounts.find(acc => acc.accountId === accountId);
        return account || RootConfig; // 如果找不到特定账户配置，返回全局配置
    }

    _getAccountIdFromSelfId(self_id_in_event) {
        // 这个辅助函数应该与 Ding.js 中的一致，或者由 Ding.js 传递 accountId
        if (typeof self_id_in_event === 'string' && self_id_in_event.startsWith(`DingDing_`)) {
            return self_id_in_event.substring("DingDing_".length);
        }
        return null; // 或其他默认
    }


    async makeBotImage (fileBuffer, accountId) { // 需要 accountId
        const accountConfig = this._getAccountConfig(accountId);
        if (accountConfig.toBotUpload && fileBuffer instanceof Buffer) {
            for (const i of Bot.uin) {
                const botInstance = Bot[i];
                if (botInstance && typeof botInstance.uploadImage === 'function') {
                    try {
                        const image = await botInstance.uploadImage(fileBuffer);
                        if (image && image.url && typeof image.url === 'string' && image.url.startsWith('http')) {
                           Bot.makeLog('debug', [`[panupload.js/makeBotImage] (Acc: ${accountId}) Successful via Bot`, i, image.url]);
                           return image.url;
                        }
                    } catch (err) {
                        Bot.makeLog('error', [`[panupload.js/makeBotImage] (Acc: ${accountId}) Bot`, i, 'upload error', err]);
                    }
                }
            }
        }
        Bot.makeLog('debug', [`[panupload.js/makeBotImage] (Acc: ${accountId}) Could not upload via Bot instances.`]);
        return undefined;
    }

    async makeMarkdownImage (dataForLogContext, fileInfoFromAdapter, summary = '图片') {
        const accountId = this._getAccountIdFromSelfId(dataForLogContext?.self_id); // 从上下文获取accountId
        const accountConfig = this._getAccountConfig(accountId);

        if (!fileInfoFromAdapter || !(fileInfoFromAdapter.buffer instanceof Buffer)) {
            Bot.makeLog('error', [`[panupload.js/makeMarkdownImage] (Acc: ${accountId}) Invalid fileInfo or missing buffer.`, fileInfoFromAdapter]);
            throw new Error("Invalid fileInfo or missing buffer for makeMarkdownImage.");
        }

        const imageBuffer = fileInfoFromAdapter.buffer;
        const originalName = fileInfoFromAdapter.name || `image_${Date.now()}.png`;
        let publicImageUrl;

        try {
            Bot.makeLog('debug', [`[panupload.js/makeMarkdownImage] (Acc: ${accountId}) Attempting Bot.fileToUrl with name:`, originalName]);
            publicImageUrl = await Bot.fileToUrl(imageBuffer, { name: originalName });

            if (!publicImageUrl || typeof publicImageUrl !== 'string' || !publicImageUrl.startsWith('http')) {
                Bot.makeLog('warn', [`[panupload.js/makeMarkdownImage] (Acc: ${accountId}) Bot.fileToUrl did not return valid URL. Received:`, publicImageUrl, '. Trying makeBotImage fallback.']);
                publicImageUrl = await this.makeBotImage(imageBuffer, accountId);
            }
        } catch (error) {
            Bot.makeLog('error', [`[panupload.js/makeMarkdownImage] (Acc: ${accountId}) Error calling Bot.fileToUrl. Trying makeBotImage fallback.`, error]);
            publicImageUrl = await this.makeBotImage(imageBuffer, accountId);
        }

        if (!publicImageUrl || typeof publicImageUrl !== 'string' || !publicImageUrl.startsWith('http')) {
            const errMsg = `[panupload.js/makeMarkdownImage] (Acc: ${accountId}) Ultimately failed to get a valid public HTTP/HTTPS image URL.`;
            Bot.makeLog('error', [errMsg, dataForLogContext?.self_id]);
            throw new Error(errMsg);
        }

        Bot.makeLog('info', [`[panupload.js/makeMarkdownImage] (Acc: ${accountId}) Successfully obtained public image URL:`, publicImageUrl]);

        const imageDetails = { url: publicImageUrl };
        try {
            const size = imageSize(imageBuffer);
            imageDetails.width = size.width;
            imageDetails.height = size.height;
        } catch (err) {
            Bot.makeLog('error', [`[panupload.js/makeMarkdownImage] (Acc: ${accountId}) imageSize error`, err]);
        }

        // 使用特定账户的配置，回退到全局配置，再回退到默认值
        const scaleConfig = accountConfig.markdownImgScale !== undefined ? accountConfig.markdownImgScale : (RootConfig.markdownImgScale !== undefined ? RootConfig.markdownImgScale : 1.0);
        if (imageDetails.width && imageDetails.height && scaleConfig) {
            const scale = parseFloat(scaleConfig);
            if (!isNaN(scale) && scale > 0) {
                imageDetails.width = Math.floor(imageDetails.width * scale);
                imageDetails.height = Math.floor(imageDetails.height * scale);
            }
        }

        return {
            des: `![${summary}]`,
            url: `(${imageDetails.url})`
        };
    }

    // dataForLogContext 包含 e.self_id 等信息，用于提取 accountId
    async imageToDingTalkUrl(dataForLogContext, fileInfoParam) {
        try {
            Bot.makeLog('debug', [`[panupload.js/imageToDingTalkUrl] Received context:`, dataForLogContext?.self_id, `fileInfo:`, fileInfoParam?.name]);
            // 将 dataForLogContext 传递给 makeMarkdownImage
            const imageMarkdown = await this.makeMarkdownImage(dataForLogContext, fileInfoParam, '图片');
            return imageMarkdown.url;
        } catch (error) {
            const accountId = this._getAccountIdFromSelfId(dataForLogContext?.self_id);
            console.error(`[panupload.js/imageToDingTalkUrl] (Acc: ${accountId}) Error:`, error.message || error);
            throw error;
        }
    }
}

export default new DingTalkImageUploader();