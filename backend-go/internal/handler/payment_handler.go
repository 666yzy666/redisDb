package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
	"miniapp/internal/service"
)

type PaymentHandler struct{ pay *service.PaymentService }

func NewPaymentHandler(pay *service.PaymentService) *PaymentHandler { return &PaymentHandler{pay: pay} }

func (h *PaymentHandler) Create(c *gin.Context) {
	var body struct {
		Amount  float64 `json:"amount"`
		Subject string  `json:"subject"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.pay.CreateOrder(c.GetInt64("userId"), body.Amount, body.Subject)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "下单成功")
}

func (h *PaymentHandler) ListMine(c *gin.Context) {
	res, err := h.pay.ListMyOrders(c.GetInt64("userId"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

func (h *PaymentHandler) Pay(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	res, err := h.pay.Pay(c.GetInt64("userId"), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "发起支付")
}

func (h *PaymentHandler) Cancel(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	res, err := h.pay.CancelOrder(c.GetInt64("userId"), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "已取消")
}

func (h *PaymentHandler) Notify(c *gin.Context) {
	var body map[string]any
	_ = c.ShouldBindJSON(&body)
	res, err := h.pay.HandleNotify(c.Param("channel"), body)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

func (h *PaymentHandler) MockComplete(c *gin.Context) {
	var body struct {
		OrderNo string `json:"orderNo"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.pay.HandleNotify("mock", map[string]any{"orderNo": body.OrderNo})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "模拟支付完成")
}

func (h *PaymentHandler) AdminListOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize"))
	res, err := h.pay.ListAllForAdmin(page, pageSize, c.Query("status"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}
