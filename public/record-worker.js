// 记录处理Worker - 多线程优化
const recordBatchQueue = [];
let batchProcessingTimer = null;
const BATCH_PROCESS_DELAY = 10; // 10毫秒批处理延迟
const MAX_BATCH_SIZE = 3; // 最大批处理大小

// 处理单个记录
function processRecord(data) {
  const plate = String(data?.plate || "").trim();
  if (!plate) return null;
  
  const id = String(data?.id || "") || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const receivedAt = Number(data?.receivedAt || Date.now()) || Date.now();
  const eventAt = Number(data?.eventAt || 0) || (() => {
    if (data?.timestamp) {
      const t = new Date(data.timestamp).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  })();
  const imageDataUrl =
    typeof data?.image === "string" && data.image
      ? data.image
      : typeof data?.imageUrl === "string" && data.imageUrl
      ? data.imageUrl
      : "";

  return {
    id,
    plate,
    receivedAt,
    eventAt,
    imageDataUrl,
    serialSentAt: Number(data?.serialSentAt || 0) || 0,
    ftpRemotePath: typeof data?.ftpRemotePath === "string" ? data.ftpRemotePath : "",
    parsedMeta: data?.parsedMeta && typeof data.parsedMeta === "object" ? data.parsedMeta : null
  };
}

// 批量处理记录
function processRecordBatch() {
  if (recordBatchQueue.length === 0) {
    batchProcessingTimer = null;
    return;
  }
  
  console.log(`[Worker] 开始批处理, 当前队列长度: ${recordBatchQueue.length}, 时间戳: ${Date.now()}`);
  
  // 获取一批记录进行处理
  const batch = recordBatchQueue.splice(0, Math.min(MAX_BATCH_SIZE, recordBatchQueue.length));
  
  if (batch.length === 0) {
    batchProcessingTimer = null;
    return;
  }
  
  // 处理批量记录
  const processedRecords = [];
  
  for (const data of batch) {
    const record = processRecord(data);
    if (record) {
      processedRecords.push(record);
    }
  }
  
  // 发送处理完成的记录到主线程
  if (processedRecords.length > 0) {
    self.postMessage({
      type: 'records-processed',
      records: processedRecords,
      queueLength: recordBatchQueue.length
    });
  }
  
  // 如果队列中还有记录，继续处理
  if (recordBatchQueue.length > 0) {
    // 动态决定下一批处理的延迟
    const delay = recordBatchQueue.length <= 2 ? 0 : BATCH_PROCESS_DELAY;
    batchProcessingTimer = setTimeout(processRecordBatch, delay);
  } else {
    batchProcessingTimer = null;
  }
}

// 添加记录到批处理队列
function addRecordToBatch(data) {
  recordBatchQueue.push(data);
  const plate = String(data?.plate || "").trim();
  console.log(`[Worker] 记录到达: ${plate}, 时间戳: ${Date.now()}, 队列长度: ${recordBatchQueue.length}`);
  
  // 监控队列状态
  if (recordBatchQueue.length > 5) {
    console.log(`[Worker] 批处理队列长度: ${recordBatchQueue.length}`);
  }
  
  // 动态处理策略
  if (!batchProcessingTimer) {
    // 如果没有定时器，根据队列长度决定立即处理还是延迟处理
    if (recordBatchQueue.length >= MAX_BATCH_SIZE || recordBatchQueue.length <= 2) {
      // 队列已满或记录较少，立即处理（延迟0毫秒）
      batchProcessingTimer = setTimeout(processRecordBatch, 0);
    } else {
      // 中等长度队列，按常规延迟处理
      batchProcessingTimer = setTimeout(processRecordBatch, BATCH_PROCESS_DELAY);
    }
  } else {
    // 已有定时器，检查是否需要加速处理
    if (recordBatchQueue.length >= MAX_BATCH_SIZE * 2) {
      // 队列积压严重，取消当前定时器，立即处理
      clearTimeout(batchProcessingTimer);
      batchProcessingTimer = setTimeout(processRecordBatch, 0);
    }
  }
}

// Worker消息处理
self.onmessage = function(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'add-record':
      addRecordToBatch(data);
      break;
      
    case 'get-queue-status':
      self.postMessage({
        type: 'queue-status',
        queueLength: recordBatchQueue.length,
        hasTimer: !!batchProcessingTimer
      });
      break;
      
    case 'clear-queue':
      recordBatchQueue.length = 0;
      if (batchProcessingTimer) {
        clearTimeout(batchProcessingTimer);
        batchProcessingTimer = null;
      }
      self.postMessage({
        type: 'queue-cleared',
        message: '队列已清空'
      });
      break;
      
    case 'ping':
      self.postMessage({
        type: 'pong',
        timestamp: Date.now()
      });
      break;
  }
};

// Worker初始化完成
self.postMessage({
  type: 'worker-ready',
  message: '记录处理Worker已就绪'
});