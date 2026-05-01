from datetime import datetime

from sqlmodel import Session, select

from app.models.rule import Mitigation, MitigationInput, Rule, RuleCreate, RuleUpdate


class RuleRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self) -> list[Rule]:
        return list(self.session.exec(select(Rule).order_by(Rule.priority.desc(), Rule.id)).all())

    def get(self, rule_id: int) -> Rule | None:
        return self.session.get(Rule, rule_id)

    def create(self, data: RuleCreate) -> Rule:
        rule = Rule(
            name=data.name,
            description=data.description,
            type=data.body.type,
            body=data.body.model_dump(),
            enabled=data.enabled,
            priority=data.priority,
            severity=data.severity,
        )
        rule.mitigations = [Mitigation(**m.model_dump()) for m in data.mitigations]
        self.session.add(rule)
        self.session.commit()
        self.session.refresh(rule)
        return rule

    def update(self, rule_id: int, data: RuleUpdate) -> Rule | None:
        rule = self.get(rule_id)
        if rule is None:
            return None
        patch = data.model_dump(exclude_unset=True)

        if "body" in patch and data.body is not None:
            rule.body = data.body.model_dump()
            rule.type = data.body.type
        for field in ("name", "description", "enabled", "priority", "severity"):
            if field in patch:
                setattr(rule, field, patch[field])

        if "mitigations" in patch and data.mitigations is not None:
            # delete-orphan cascade on the relationship handles removal of dropped rows
            rule.mitigations = [Mitigation(**m.model_dump()) for m in data.mitigations]

        rule.updated_at = datetime.utcnow()
        self.session.add(rule)
        self.session.commit()
        self.session.refresh(rule)
        return rule

    def delete(self, rule_id: int) -> bool:
        rule = self.get(rule_id)
        if rule is None:
            return False
        self.session.delete(rule)
        self.session.commit()
        return True

    # --- per-mitigation operations -------------------------------------------

    def get_mitigation(self, mitigation_id: int) -> Mitigation | None:
        return self.session.get(Mitigation, mitigation_id)

    def add_mitigation(self, rule_id: int, data: MitigationInput) -> Mitigation | None:
        rule = self.get(rule_id)
        if rule is None:
            return None
        mitigation = Mitigation(rule_id=rule_id, **data.model_dump())
        self.session.add(mitigation)
        rule.updated_at = datetime.utcnow()
        self.session.add(rule)
        self.session.commit()
        self.session.refresh(mitigation)
        return mitigation

    def update_mitigation(self, rule_id: int, mitigation_id: int, data: MitigationInput) -> Mitigation | None:
        mitigation = self.get_mitigation(mitigation_id)
        if mitigation is None or mitigation.rule_id != rule_id:
            return None
        for key, value in data.model_dump().items():
            setattr(mitigation, key, value)
        rule = self.get(rule_id)
        if rule is not None:
            rule.updated_at = datetime.utcnow()
            self.session.add(rule)
        self.session.add(mitigation)
        self.session.commit()
        self.session.refresh(mitigation)
        return mitigation

    def delete_mitigation(self, rule_id: int, mitigation_id: int) -> bool:
        mitigation = self.get_mitigation(mitigation_id)
        if mitigation is None or mitigation.rule_id != rule_id:
            return False
        self.session.delete(mitigation)
        rule = self.get(rule_id)
        if rule is not None:
            rule.updated_at = datetime.utcnow()
            self.session.add(rule)
        self.session.commit()
        return True
