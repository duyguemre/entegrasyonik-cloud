import { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { runImageApi } from "../rpc/RunOperation";
import { sanitizeResponse } from "@platform/core/security/responseSanitizer";
import { sendHttpError } from '../http/errorEnvelope';
import { logger } from '@platform/core/logger';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'ImageApiManager');

function sendImageError(res: Response, error: any) {
    const status = error?.statusCode || 500;
    if (status >= 500) logger.child({ module: 'ImageApi' }).error({ err: error }, 'Beklenmeyen hata');
    return sendHttpError(res, status, status >= 500 ? undefined : error.message);
}

// ADR-0001: görsel rotaları da aynı authenticate middleware'inden geçer (açık rota YOK); res.locals.userContext/principal
// yalnızca doğrulanmış principal'dan dolar. Fail-closed: principal yoksa (middleware takılmamışsa) 401.
function requireAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (!res.locals || !res.locals.principal) {
        sendHttpError(res, 401, 'Token is undefined', 'UNAUTHENTICATED');
        return;
    }
    next();
}

export function configureImageServices(
    app: Express,
    context: string,
    imageFilesPath: string
) {
    const upload = multer({ storage: multer.memoryStorage() })

    app.post(context + '/upload', requireAuthenticated, (req: any, res: Response) => {

        upload.any()(req, res, async (err: any) => {
            if (!req.body) {
                return res.status(400).send('Ürün bilgisi boş.');
            }

            try {
                const uploadImageForm = JSON.parse(req.body.uploadImageForm);

                const files = req.files;
                if (!files || files.length === 0) {
                    return res.status(400).send('Dosyalar bulunamadı.');
                }
                //const result = await this.uploadToCloudflareR2(files, product)
                /*                     const result = await runOperation("ImageService", "uploadToCloudflareR2", { files, uploadImageForm }) */
                const result = await runImageApi("upload", res.locals.userContext, { files, uploadImageForm }, res.locals.principal)
                return res.status(200).send(sanitizeResponse({ result }, { service: 'ImageApi', operation: 'upload' }));

            } catch (error: any) {
                return sendImageError(res, error);
            }
        })
    })

    app.post(context + '/uploadIdentity', requireAuthenticated, (req: any, res: Response) => {
        upload.any()(req, res, async (err: any) => {
            try {
                const files = req.files;
                if (!files || files.length === 0) {
                    return res.status(400).send('Dosya bulunamadı.');
                }
                const result = await runImageApi("uploadIdentity", res.locals.userContext, { files }, res.locals.principal)
                return res.status(200).send(sanitizeResponse(result, { service: 'ImageApi', operation: 'uploadIdentity' }));
            } catch (error: any) {
                return sendImageError(res, error);
            }
        })
    })


    app.post(context + '/getImages', requireAuthenticated, async (req: Request, res: Response) => {
        try {
            const resp = await runImageApi("getImages", res.locals.userContext, req.body, res.locals.principal)
            res.status(200).send(sanitizeResponse(resp, { service: 'ImageApi', operation: 'getImages' }))
        } catch (e: any) {
            res.status(e.statusCode || 500).send({ error: e.message, service: req.params.service, operation: req.params.operation })
        }
    })

    app.post(context + '/deleteImage', requireAuthenticated, async (req: Request, res: Response) => {
        try {
            //const resp = await deleteImage(req.body.imageId)
            const resp = await runImageApi("deleteImage", res.locals.userContext, req.body, res.locals.principal)

            res.status(200).send(sanitizeResponse(resp, { service: 'ImageApi', operation: 'deleteImage' }))
        } catch (e: any) {
            res.status(e.statusCode || 500).send({ error: e.message, service: req.params.service, operation: req.params.operation })
        }
    })

    app.post(context + '/sortImages', requireAuthenticated, async (req: Request, res: Response) => {
        try {
            //const resp = await deleteImage(req.body.imageId)
            const resp = await runImageApi("sortImages", res.locals.userContext, req.body, res.locals.principal)
            res.status(200).send(sanitizeResponse(resp, { service: 'ImageApi', operation: 'sortImages' }))
        } catch (e: any) {
            res.status(e.statusCode || 500).send({ error: e.message, service: req.params.service, operation: req.params.operation })
        }
    })

    app.post(context + '/deleteImageSelected', requireAuthenticated, async (req: Request, res: Response) => {
        try {
            var resp: any = undefined
            resp = await runImageApi("deleteImageSelected", res.locals.userContext, req.body, res.locals.principal)
/*                 for (let imageId of req.body.selectedImages) {
                //resp = await deleteImage(imageId)
                resp = await runOperation("ImageService", "deleteImage", { imageId: imageId })
            }
*/                res.status(200).send(sanitizeResponse(resp, { service: 'ImageApi', operation: 'deleteImageSelected' }))
        } catch (e: any) {
            res.status(e.statusCode || 500).send({ error: e.message, service: req.params.service, operation: req.params.operation })
        }
    })


    app.get(context + '/getImage/:imageId', requireAuthenticated, async (req: Request, res: Response) => {
        try {
            const image = await runImageApi("getImage", res.locals.userContext, { _id: req.params.imageId }, res.locals.principal)
            let imagePath = undefined
            if (image.isVariant == true) {
                imagePath = imageFilesPath + image.productId + '/' + image.variantId + '/' + image._id + '_t' + image.extension
            } else {
                imagePath = imageFilesPath + image.productId + '/' + image._id + '_t' + image.extension
            }

            res.sendFile(imagePath);

        } catch (e: any) {
            log.error('IMAGE_API_FAILED', '[ImageApiManager] istek hatası', { err: e, service: req.params.service, operation: req.params.operation })
            res.status(e.statusCode || 500).send({ error: e.message, service: req.params.service, operation: req.params.operation })
        }
    })

    app.get(context + '/downloadImage/:imageId', requireAuthenticated, async (req: Request, res: Response) => {
        try {
            const image = await runImageApi("downloadImage", res.locals.userContext, { _id: req.params.imageId }, res.locals.principal)
            let imagePath = undefined
            if (image.isVariant == true) {
                imagePath = imageFilesPath + image.productId + '/' + image.variantId + '/' + image._id + image.extension
            } else {
                imagePath = imageFilesPath + image.productId + '/' + image._id + image.extension
            }
            /*                 res.header("Content-type","application/octet-stream")
                            res.sendFile(); */
            res.set("Content-Disposition", "attachment;filename=" + image._id + image.extension);
            res.download(imagePath);

        } catch (e: any) {
            log.error('IMAGE_API_FAILED', '[ImageApiManager] istek hatası', { err: e, service: req.params.service, operation: req.params.operation })
            res.status(e.statusCode || 500).send({ error: e.message, service: req.params.service, operation: req.params.operation })
        }
    })

}