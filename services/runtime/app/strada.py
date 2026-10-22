"""Client for the Strada systems service. Every call is a tool the agents can use; reads are free, writes are the approved ones only."""
from __future__ import annotations
import httpx
from .config import settings

class StradaSystems:
    def __init__(self, base: str | None = None): self.base = (base or settings.strada_sys_url).rstrip("/")
    async def _get(self, path: str, **params):
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(self.base + path, params={k: v for k, v in params.items() if v is not None}); r.raise_for_status(); return r.json()
    async def _send(self, method: str, path: str, json: dict | None = None, **params):
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.request(method, self.base + path, json=json, params=params)
            if r.status_code >= 400:
                try: detail = r.json().get("detail")
                except Exception: detail = r.text
                return dict(error=detail, status=r.status_code)
            return r.json()
    # reads
    async def employee(self, employee_id: str): return await self._get(f"/people/employees/{employee_id}")
    async def find_employee(self, **kw): return await self._get("/people/employees", **kw)
    async def payment_status(self, employee_id: str): return await self._get(f"/pay/payments/{employee_id}")
    async def payslips(self, employee_id: str, limit: int = 2): return await self._get(f"/pay/payslips/{employee_id}", limit=limit)
    async def pay_calendar(self, pay_group: str | None = None): return await self._get("/pay/calendar", pay_group=pay_group)
    async def ach_returns(self, pay_group: str | None = None, pay_date: str | None = None): return await self._get("/pay/ach/returns", pay_group=pay_group, pay_date=pay_date)
    async def timesheets(self, pay_group: str | None = None, status: str | None = None): return await self._get("/time/timesheets", pay_group=pay_group, status=status)
    async def garnishment_orders(self, employee_id: str): return await self._get(f"/garnishments/orders/{employee_id}")
    async def order_document(self, employee_id: str, ref: str): return await self._get(f"/garnishments/orders/{employee_id}/documents/{ref}")
    async def audit(self, employee_id: str | None = None): return await self._get("/audit", employee_id=employee_id)
    async def tax_documents(self, employee_id: str): return await self._get(f"/tax/documents/{employee_id}")
    async def state_rules(self, state: str): return await self._get(f"/tax/rules/{state}")
    async def assist_case(self, reference: str): return await self._get(f"/assist/cases/{reference}")
    # approved writes
    async def verify(self, employee_id: str, **kw): return await self._send("POST", f"/people/employees/{employee_id}/verify", json=kw)
    async def update_bank(self, employee_id: str, routing: str, account: str): return await self._send("PUT", f"/people/employees/{employee_id}/bank", json=dict(routing=routing, account=account, confirmed_by="employee"))
    async def update_withholding(self, employee_id: str, **kw): return await self._send("PUT", f"/people/employees/{employee_id}/withholding", json=kw)
    async def reissue_document(self, employee_id: str, year: int, type_: str = "W-2"): return await self._send("POST", f"/tax/documents/{employee_id}/reissue", json=dict(year=year, type=type_))
    async def create_assist_case(self, **kw): return await self._send("POST", "/assist/cases", json=kw)

strada = StradaSystems()
