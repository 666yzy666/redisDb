package channel

// Channel 支付渠道抽象。接真实渠道(支付宝/Stripe)只需实现本接口并注册。
type Channel interface {
	Name() string
	// CreateCharge 发起支付,返回给前端的信息(mock 返回模拟支付页地址)
	CreateCharge(orderNo string) map[string]any
	// ParseNotify 解析网关回调,返回 (orderNo, success)。真实渠道需在此验签。
	ParseNotify(body map[string]any) (string, bool)
}

type mockChannel struct{}

func (mockChannel) Name() string { return "mock" }

func (mockChannel) CreateCharge(orderNo string) map[string]any {
	return map[string]any{"payUrl": "/payment/mock?orderNo=" + orderNo, "channel": "mock"}
}

func (mockChannel) ParseNotify(body map[string]any) (string, bool) {
	no, _ := body["orderNo"].(string)
	return no, no != "" // mock 直接信任 body
}

// 渠道注册表
var registry = map[string]Channel{
	"mock": mockChannel{},
}

func Get(name string) (Channel, bool) {
	c, ok := registry[name]
	return c, ok
}
