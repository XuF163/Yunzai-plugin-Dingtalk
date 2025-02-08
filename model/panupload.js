import Config from "../lib/config.js";
import imageSize from "image-size";

/**
 * 钉钉图片上传工具类 (使用Bot框架的图片上传方法)
 */
class DingTalkImageUploader {

    constructor() {
        // 构造函数可以用来初始化配置，这里直接从 Config 中读取
        this.config = Config; // 直接存储 Config 实例，方便后续使用
    }

    async makeBotImage (file) {
        if (this.config.toBotUpload) {
            for (const i of Bot.uin) {
                if (!Bot[i].uploadImage) continue;
                try {
                    const image = await Bot[i].uploadImage(file);
                    if (image.url) return image;
                } catch (err) {
                    Bot.makeLog('error', ['Bot', i, '钉钉图片上传错误(makeBotImage)', file, err]);
                }
            }
        }
    }

    async makeMarkdownImage (data, file, summary = '图片') {
        const buffer = await Bot.Buffer(file);
        const image =
            await this.makeBotImage(file) ||
            { url: await Bot.fileToUrl(file) };

        if (!image.width || !image.height) {
            try {
                const size = imageSize(buffer);
                image.width = size.width;
                image.height = size.height;
            } catch (err) {
                Bot.makeLog('error', ['图片分辨率检测错误(makeMarkdownImage)', file, err], data.self_id);
            }
        }

        image.width = Math.floor(image.width * this.config.markdownImgScale); // 使用 this.config
        image.height = Math.floor(image.height * this.config.markdownImgScale); // 使用 this.config

        return {
            des: `![${summary} #${image.width || 0}px #${image.height || 0}px]`,
            url: `(${image.url})`
        };
    }


    /**
     * 图片转钉钉URL核心函数 (公共方法，供外部调用)
     * @param {string|Buffer} imageInput 文件路径或图片Buffer
     * @returns {Promise<string>} 图片的URL (media_id 或其他URL)
     */
    async imageToDingTalkUrl(imageInput) {
        try {
            const imageMarkdown = await this.makeMarkdownImage({}, imageInput, '图片'); // 调用 makeMarkdownImage
            return imageMarkdown.url; // 返回 markdown 结果中的 url
        } catch (error) {
            console.error('处理过程出错 (imageToDingTalkUrl):', error);
            throw error; // 抛出错误，让调用者处理
        }
    }
}

export default new DingTalkImageUploader();

// import fetch from 'node-fetch';
// import crypto from 'crypto';
// import querystring from 'querystring';
// import FormData from 'form-data';
// import fs from 'fs';
// import path from 'path';
// import os from 'os'; //  !!! 添加 os 模块
// import Config from "../lib/config.js";
//
// /**
//  * 钉钉图片上传工具类
//  */
// class DingTalkImageUploader {
//
//     constructor() {
//         // 构造函数可以用来初始化配置，这里直接从 Config 中读取，也可以选择在构造函数中传入 appkey 和 appsecret
//         this.appKey = Config.AppKey;
//         this.appSecret = Config.AppSecret;
//     }
//
//     /**
//      * 获取钉钉访问令牌 (私有方法，类内部使用)
//      * @returns {Promise<string>} access_token
//      * @private
//      */
//     async #getAccessToken() {
//         const url = 'https://oapi.dingtalk.com/gettoken';
//         const params = {
//             appkey: this.appKey,
//             appsecret: this.appSecret
//         };
//         const response = await fetch(`${url}?${querystring.stringify(params)}`);
//         const data = await response.json();
//         if (!response.ok) {
//             throw new Error(`获取访问令牌失败: ${data.errmsg || response.statusText}`);
//         }
//         return data.access_token;
//     }
//
//     /**
//      * 上传文件到钉盘 (私有方法，类内部使用)
//      * @param {string|Buffer} imageInput 文件路径或图片Buffer
//      * @param {string} accessToken 钉钉访问令牌
//      * @returns {Promise<string>} media_id
//      * @private
//      */
//     async #uploadToDingTalk(imageInput, accessToken) {
//         const url = 'https://oapi.dingtalk.com/media/upload';
//         const formData = new FormData();
//         formData.append('access_token', accessToken);
//         formData.append('type', 'image');
//
//         let fileBuffer;
//         if (Buffer.isBuffer(imageInput)) {
//             fileBuffer = imageInput;
//
//             //  !!!  将 Buffer 暂存为临时文件  !!!
//             const tempFilePath = path.join(os.tmpdir(), `temp_image_${Date.now()}.png`); //  生成临时文件路径
//             await fs.promises.writeFile(tempFilePath, fileBuffer); // 将 Buffer 写入临时文件
//
//             //  !!!  使用临时文件路径上传  !!!
//             formData.append('media', fs.createReadStream(tempFilePath)); // 使用 createReadStream 读取临时文件并添加到 formData
//
//         } else {
//             const filePath = imageInput;
//             if (!fs.existsSync(filePath)) {
//                 throw new Error(`文件路径不存在: ${filePath}`);
//             }
//             fileBuffer = fs.readFileSync(filePath);
//             formData.append('media', fileBuffer, { filename: path.basename(filePath) });
//         }
//
//         const response = await fetch(url, {
//             method: 'POST',
//             body: formData,
//         });
//         const data = await response.json();
//         if (!response.ok) {
//             throw new Error(`上传文件到钉盘失败: ${data.errmsg || response.statusText}`);
//         }
//         return data.media_id;
//     }
//
//     /**
//      * 图片转钉钉URL核心函数 (公共方法，供外部调用)
//      * @param {string|Buffer} imageInput 文件路径或图片Buffer
//      * @returns {Promise<string>} 图片的URL (media_id)
//      */
//     async imageToDingTalkUrl(imageInput) {
//         try {
//             const accessToken = await this.#getAccessToken();
//             const mediaId = await this.#uploadToDingTalk(imageInput, accessToken);
//             return mediaId; // 直接返回 media_id，即图片的URL
//         } catch (error) {
//             console.error('处理过程出错:', error);
//             throw error; // 抛出错误，让调用者处理
//         }
//     }
// }
//
// export default new DingTalkImageUploader();
// // import fetch from 'node-fetch';
// // import crypto from 'crypto';
// // import querystring from 'querystring';
// // import FormData from 'form-data';
// // import fs from 'fs';
// // import path from 'path';
// // import Config from "../lib/config.js";
// //
// // /**
// //  * 钉钉图片上传工具类
// //  */
// // class DingTalkImageUploader {
// //
// //     constructor() {
// //         // 构造函数可以用来初始化配置，这里直接从 Config 中读取，也可以选择在构造函数中传入 appkey 和 appsecret
// //         this.appKey = Config.AppKey;
// //         this.appSecret = Config.AppSecret;
// //     }
// //
// //     /**
// //      * 获取钉钉访问令牌 (私有方法，类内部使用)
// //      * @returns {Promise<string>} access_token
// //      * @private
// //      */
// //     async #getAccessToken() {
// //         const url = 'https://oapi.dingtalk.com/gettoken';
// //         const params = {
// //             appkey: this.appKey,
// //             appsecret: this.appSecret
// //         };
// //         const response = await fetch(`${url}?${querystring.stringify(params)}`);
// //         const data = await response.json();
// //         if (!response.ok) {
// //             throw new Error(`获取访问令牌失败: ${data.errmsg || response.statusText}`);
// //         }
// //         return data.access_token;
// //     }
// //
// //     /**
// //      * 上传文件到钉盘 (私有方法，类内部使用)
// //      * @param {string|Buffer} imageInput 文件路径或图片Buffer
// //      * @param {string} accessToken 钉钉访问令牌
// //      * @returns {Promise<string>} media_id
// //      * @private
// //      */
// //     async #uploadToDingTalk(imageInput, accessToken) {
// //         const url = 'https://oapi.dingtalk.com/media/upload';
// //         const formData = new FormData();
// //         formData.append('access_token', accessToken);
// //         formData.append('type', 'image');
// //
// //         let fileBuffer;
// //         if (Buffer.isBuffer(imageInput)) {
// //             fileBuffer = imageInput;
// //             formData.append('media', fileBuffer); // 移除 contentType 选项
// //         } else {
// //             const filePath = imageInput;
// //             if (!fs.existsSync(filePath)) {
// //                 throw new Error(`文件路径不存在: ${filePath}`);
// //             }
// //             fileBuffer = fs.readFileSync(filePath);
// //             formData.append('media', fileBuffer, { filename: path.basename(filePath) });
// //         }
// //
// //         const response = await fetch(url, {
// //             method: 'POST',
// //             body: formData,
// //         });
// //         const data = await response.json();
// //         if (!response.ok) {
// //             throw new Error(`上传文件到钉盘失败: ${data.errmsg || response.statusText}`);
// //         }
// //         return data.media_id;
// //     }
// //
// //     /**
// //      * 图片转钉钉URL核心函数 (公共方法，供外部调用)
// //      * @param {string|Buffer} imageInput 文件路径或图片Buffer
// //      * @returns {Promise<string>} 图片的URL (media_id)
// //      */
// //     async imageToDingTalkUrl(imageInput) {
// //         try {
// //             const accessToken = await this.#getAccessToken();
// //             const mediaId = await this.#uploadToDingTalk(imageInput, accessToken);
// //             return mediaId; // 直接返回 media_id，即图片的URL
// //         } catch (error) {
// //             console.error('处理过程出错:', error);
// //             throw error; // 抛出错误，让调用者处理
// //         }
// //     }
// // }
// //
// // export default new DingTalkImageUploader(); // 默认导出类